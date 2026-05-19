//! Tauri commands — the typed bridge between the React UI and the backend.

use crate::db::{Conversation, StoredMessage};
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

/// User-facing settings, mirrored 1:1 by the TypeScript `Settings` type.
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct SettingsDto {
    pub base_url: String,
    pub api_key: String,
    pub default_model: String,
    pub theme: String,
}

/// Returned by `send_message` once the turn is persisted.
#[derive(Debug, Serialize)]
pub struct SendResult {
    pub user_message: StoredMessage,
    pub assistant_message: StoredMessage,
}

// ---- conversations ----

#[tauri::command]
pub fn list_conversations(state: State<'_, AppState>) -> Result<Vec<Conversation>> {
    state.db.list_conversations()
}

#[tauri::command]
pub fn create_conversation(
    state: State<'_, AppState>,
    title: String,
    model: String,
) -> Result<Conversation> {
    let now = now_ms();
    let conv = Conversation {
        id: new_id(),
        title: if title.trim().is_empty() {
            "New chat".to_string()
        } else {
            title
        },
        model,
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
pub fn get_messages(
    state: State<'_, AppState>,
    conversation_id: String,
) -> Result<Vec<StoredMessage>> {
    state.db.list_messages(&conversation_id)
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

// ---- streaming chat ----

/// Send a user message and stream the assistant's reply.
///
/// Every [`StreamEvent`] is pushed through `on_event` (a Tauri `Channel`,
/// the lowest-overhead IPC primitive for high-frequency streaming). When the
/// stream ends, both messages are persisted and returned.
#[tauri::command]
pub async fn send_message(
    state: State<'_, AppState>,
    conversation_id: String,
    text: String,
    model: String,
    on_event: Channel<StreamEvent>,
) -> Result<SendResult> {
    // 1. Persist the user's message.
    let user_msg = StoredMessage {
        id: new_id(),
        conversation_id: conversation_id.clone(),
        role: "user".to_string(),
        content: text,
        reasoning: None,
        metrics: None,
        created_at: now_ms(),
    };
    state.db.insert_message(&user_msg)?;

    // 2. Assemble the prompt from the conversation history.
    let history = state.db.list_messages(&conversation_id)?;
    let messages: Vec<ChatMessage> = history
        .iter()
        .filter(|m| m.role == "user" || m.role == "assistant")
        .filter(|m| !m.content.is_empty())
        .map(|m| ChatMessage {
            role: m.role.clone(),
            content: m.content.clone(),
        })
        .collect();

    // 3. Build the provider client from saved settings.
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

    // 4. Stream the reply, accumulating final text + metrics as it flows.
    let mut content = String::new();
    let mut reasoning = String::new();
    let mut final_metrics = Metrics::default();
    {
        let channel = on_event.clone();
        let collect = |event: StreamEvent| {
            match &event {
                StreamEvent::Content { delta } => content.push_str(delta),
                StreamEvent::Reasoning { delta } => reasoning.push_str(delta),
                StreamEvent::Done { metrics, .. } => final_metrics = metrics.clone(),
                _ => {}
            }
            let _ = channel.send(event);
        };
        if let Err(e) = client.stream_chat(&req, collect).await {
            let _ = on_event.send(StreamEvent::Error {
                message: e.to_string(),
            });
            return Err(e);
        }
    }

    // 5. Persist the assistant's reply.
    let assistant_msg = StoredMessage {
        id: new_id(),
        conversation_id: conversation_id.clone(),
        role: "assistant".to_string(),
        content,
        reasoning: if reasoning.is_empty() {
            None
        } else {
            Some(reasoning)
        },
        metrics: Some(serde_json::to_string(&final_metrics)?),
        created_at: now_ms(),
    };
    state.db.insert_message(&assistant_msg)?;
    state.db.touch_conversation(&conversation_id, now_ms())?;
    if !model.is_empty() {
        state
            .db
            .update_conversation_model(&conversation_id, &model)?;
    }

    Ok(SendResult {
        user_message: user_msg,
        assistant_message: assistant_msg,
    })
}
