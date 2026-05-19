//! Tauri commands — the typed bridge between the React UI and the backend.
//!
//! The unit of interaction is a *turn* (one prompt) carrying one or more
//! *runs* (one model's streamed response). Racing N models = N concurrent
//! `send_run` calls against the same turn.

use crate::db::{Conversation, Run, Turn, TurnWithRuns};
use crate::error::{AppError, Result};
use crate::llm::{ChatMessage, ChatRequest, LlmClient, Metrics, StreamEvent};
use crate::AppState;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::ipc::Channel;
use tauri::State;

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// One persisted raw SSE frame.
#[derive(Serialize)]
struct RawFrameRec {
    at_ms: u64,
    data: String,
}

/// User-facing settings, mirrored 1:1 by the TypeScript `Settings` type.
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct SettingsDto {
    pub base_url: String,
    pub api_key: String,
    pub default_model: String,
    pub theme: String,
}

// ---- conversations ----

#[tauri::command]
pub fn list_conversations(state: State<'_, AppState>) -> Result<Vec<Conversation>> {
    state.db.list_conversations()
}

#[tauri::command]
pub fn create_conversation(state: State<'_, AppState>, title: String) -> Result<Conversation> {
    let now = now_ms();
    let conv = Conversation {
        id: new_id(),
        title: if title.trim().is_empty() {
            "New session".to_string()
        } else {
            title
        },
        created_at: now,
        updated_at: now,
    };
    state.db.create_conversation(&conv)?;
    Ok(conv)
}

#[tauri::command]
pub fn rename_conversation(state: State<'_, AppState>, id: String, title: String) -> Result<()> {
    state.db.rename_conversation(&id, &title)
}

#[tauri::command]
pub fn delete_conversation(state: State<'_, AppState>, id: String) -> Result<()> {
    state.db.delete_conversation(&id)
}

#[tauri::command]
pub fn get_turns(
    state: State<'_, AppState>,
    conversation_id: String,
) -> Result<Vec<TurnWithRuns>> {
    state.db.get_turns_with_runs(&conversation_id)
}

/// Create a turn (one prompt). Runs are attached afterwards via `send_run`.
#[tauri::command]
pub fn create_turn(
    state: State<'_, AppState>,
    conversation_id: String,
    prompt: String,
) -> Result<Turn> {
    let turn = Turn {
        id: new_id(),
        conversation_id,
        prompt,
        created_at: now_ms(),
    };
    state.db.create_turn(&turn)?;
    Ok(turn)
}

// ---- settings ----

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<SettingsDto> {
    Ok(SettingsDto {
        base_url: state.db.get_setting("base_url")?.unwrap_or_default(),
        api_key: state.db.get_setting("api_key")?.unwrap_or_default(),
        default_model: state.db.get_setting("default_model")?.unwrap_or_default(),
        theme: state
            .db
            .get_setting("theme")?
            .unwrap_or_else(|| "dark".to_string()),
    })
}

#[tauri::command]
pub fn update_settings(state: State<'_, AppState>, settings: SettingsDto) -> Result<()> {
    state.db.set_setting("base_url", settings.base_url.trim())?;
    state.db.set_setting("api_key", settings.api_key.trim())?;
    state
        .db
        .set_setting("default_model", settings.default_model.trim())?;
    state.db.set_setting("theme", settings.theme.trim())?;
    Ok(())
}

#[tauri::command]
pub async fn list_models(state: State<'_, AppState>) -> Result<Vec<String>> {
    let base_url = state.db.get_setting("base_url")?.unwrap_or_default();
    let api_key = state.db.get_setting("api_key")?.unwrap_or_default();
    if api_key.trim().is_empty() {
        return Err(AppError::Other("No API key set.".to_string()));
    }
    LlmClient::new(state.http.clone(), base_url, api_key)
        .list_models()
        .await
}

// ---- streaming a run ----

/// Stream one model's response to a turn.
///
/// History is assembled from prior turns' primary (first-finished) run. Call
/// this concurrently with several models on the same `turn_id` to race them —
/// each call streams independently and persists its own run.
#[tauri::command]
pub async fn send_run(
    state: State<'_, AppState>,
    turn_id: String,
    model: String,
    on_event: Channel<StreamEvent>,
) -> Result<Run> {
    let turn = state
        .db
        .get_turn(&turn_id)?
        .ok_or_else(|| AppError::Other("turn not found".to_string()))?;

    // Assemble history from each prior turn's primary run.
    let mut messages: Vec<ChatMessage> = Vec::new();
    for prior in state.db.list_turns(&turn.conversation_id)? {
        if prior.id == turn.id || prior.created_at >= turn.created_at {
            continue;
        }
        let runs = state.db.list_runs(&prior.id)?;
        if let Some(primary) = runs
            .iter()
            .find(|r| r.status == "ok" && !r.content.is_empty())
        {
            messages.push(ChatMessage {
                role: "user".to_string(),
                content: prior.prompt.clone(),
            });
            messages.push(ChatMessage {
                role: "assistant".to_string(),
                content: primary.content.clone(),
            });
        }
    }
    messages.push(ChatMessage {
        role: "user".to_string(),
        content: turn.prompt.clone(),
    });

    let base_url = state.db.get_setting("base_url")?.unwrap_or_default();
    let api_key = state.db.get_setting("api_key")?.unwrap_or_default();
    if api_key.trim().is_empty() {
        let _ = on_event.send(StreamEvent::Error {
            message: "No API key set. Open Settings to add one.".to_string(),
        });
        return Err(AppError::Other("missing api key".to_string()));
    }
    let client = LlmClient::new(state.http.clone(), base_url, api_key);
    let req = ChatRequest {
        model: model.clone(),
        messages,
        temperature: None,
    };

    // Stream, accumulating everything we need to persist the run.
    let mut content = String::new();
    let mut reasoning = String::new();
    let mut metrics = Metrics::default();
    let mut raw: Vec<RawFrameRec> = Vec::new();
    let mut finish_reason: Option<String> = None;
    let mut error: Option<String> = None;
    {
        let channel = on_event.clone();
        let collect = |event: StreamEvent| {
            match &event {
                StreamEvent::Content { delta } => content.push_str(delta),
                StreamEvent::Reasoning { delta } => reasoning.push_str(delta),
                StreamEvent::RawFrame { at_ms, data } => {
                    if raw.len() < 200 {
                        raw.push(RawFrameRec {
                            at_ms: *at_ms,
                            data: data.clone(),
                        });
                    }
                }
                StreamEvent::Done {
                    metrics: m,
                    finish_reason: fr,
                } => {
                    metrics = m.clone();
                    finish_reason = fr.clone();
                }
                StreamEvent::Error { message } => error = Some(message.clone()),
                _ => {}
            }
            let _ = channel.send(event);
        };
        if let Err(e) = client.stream_chat(&req, collect).await {
            let _ = on_event.send(StreamEvent::Error {
                message: e.to_string(),
            });
            error = Some(e.to_string());
        }
    }

    let run = Run {
        id: new_id(),
        turn_id,
        model,
        content,
        reasoning: if reasoning.is_empty() {
            None
        } else {
            Some(reasoning)
        },
        metrics: serde_json::to_string(&metrics).ok(),
        raw: serde_json::to_string(&raw).ok(),
        finish_reason,
        status: (if error.is_some() { "error" } else { "ok" }).to_string(),
        error,
        created_at: now_ms(),
    };
    state.db.insert_run(&run)?;
    state.db.touch_conversation(&turn.conversation_id, now_ms())?;
    Ok(run)
}
