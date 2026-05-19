//! OpenAI-compatible streaming LLM client.
//!
//! The provider speaks the OpenAI wire format (DMXAPI, OpenAI, most proxies).
//! `stream_chat` consumes the Server-Sent-Events response and turns it into a
//! sequence of structured [`StreamEvent`]s — the backbone of Maple's
//! "intermediate process" display.

use crate::error::{AppError, Result};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::time::Instant;

// ---- public request types ----

/// A single chat message in the prompt.
#[derive(Debug, Clone, Serialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// A chat completion request assembled by the backend.
#[derive(Debug, Clone)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub temperature: Option<f32>,
}

// ---- metrics & events streamed to the UI ----

/// Performance and token-usage metrics for one assistant turn.
#[derive(Debug, Clone, Default, Serialize)]
pub struct Metrics {
    /// Time to first token (ms).
    pub ttft_ms: Option<u64>,
    /// Total wall-clock time (ms).
    pub elapsed_ms: Option<u64>,
    /// Completion tokens per second across the streaming window.
    pub tokens_per_sec: Option<f64>,
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
    pub reasoning_tokens: Option<u32>,
    pub total_tokens: Option<u32>,
}

/// An event in the lifecycle of a single assistant turn. Serialized with a
/// `kind` tag so the frontend can discriminate on it.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum StreamEvent {
    /// Request is being sent.
    Started { model: String },
    /// Provider responded; the stream is open.
    Connected,
    /// A chunk of reasoning / "thinking" text.
    Reasoning { delta: String },
    /// A chunk of answer text.
    Content { delta: String },
    /// The model requested a tool / function call.
    ToolCall {
        id: String,
        name: String,
        arguments: String,
    },
    /// A metrics update (emitted at first token and on completion).
    Metrics { metrics: Metrics },
    /// The turn finished successfully.
    Done {
        finish_reason: Option<String>,
        metrics: Metrics,
    },
    /// The turn failed.
    Error { message: String },
}

// ---- wire types ----

#[derive(Serialize)]
struct ApiChatRequest<'a> {
    model: &'a str,
    messages: &'a [ChatMessage],
    stream: bool,
    stream_options: StreamOptions,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
}

#[derive(Serialize)]
struct StreamOptions {
    include_usage: bool,
}

#[derive(Debug, Deserialize)]
struct ChatChunk {
    #[serde(default)]
    choices: Vec<ChunkChoice>,
    #[serde(default)]
    usage: Option<ApiUsage>,
}

#[derive(Debug, Deserialize)]
struct ChunkChoice {
    #[serde(default)]
    delta: ChunkDelta,
    #[serde(default)]
    finish_reason: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct ChunkDelta {
    #[serde(default)]
    content: Option<String>,
    // Reasoning models expose "thinking" under different keys per provider.
    #[serde(default, alias = "reasoning")]
    reasoning_content: Option<String>,
    #[serde(default)]
    tool_calls: Option<Vec<ToolCallDelta>>,
}

#[derive(Debug, Deserialize)]
struct ToolCallDelta {
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    function: Option<FunctionDelta>,
}

#[derive(Debug, Deserialize)]
struct FunctionDelta {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    arguments: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ApiUsage {
    #[serde(default)]
    prompt_tokens: Option<u32>,
    #[serde(default)]
    completion_tokens: Option<u32>,
    #[serde(default)]
    total_tokens: Option<u32>,
    #[serde(default)]
    completion_tokens_details: Option<CompletionTokensDetails>,
}

#[derive(Debug, Deserialize)]
struct CompletionTokensDetails {
    #[serde(default)]
    reasoning_tokens: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct ModelsResponse {
    #[serde(default)]
    data: Vec<ModelEntry>,
}

#[derive(Debug, Deserialize)]
struct ModelEntry {
    id: String,
}

// ---- client ----

pub struct LlmClient {
    http: reqwest::Client,
    base_url: String,
    api_key: String,
}

impl LlmClient {
    pub fn new(http: reqwest::Client, base_url: String, api_key: String) -> Self {
        Self {
            http,
            base_url: base_url.trim().trim_end_matches('/').to_string(),
            api_key: api_key.trim().to_string(),
        }
    }

    /// Fetch the provider's available model ids (sorted).
    pub async fn list_models(&self) -> Result<Vec<String>> {
        let url = format!("{}/models", self.base_url);
        let resp = self
            .http
            .get(&url)
            .bearer_auth(&self.api_key)
            .send()
            .await?;
        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::Provider(format!(
                "model list failed ({status}): {}",
                body.chars().take(300).collect::<String>()
            )));
        }
        let parsed: ModelsResponse = resp.json().await?;
        let mut ids: Vec<String> = parsed.data.into_iter().map(|m| m.id).collect();
        ids.sort();
        ids.dedup();
        Ok(ids)
    }

    /// Stream a chat completion, invoking `on_event` for every [`StreamEvent`].
    pub async fn stream_chat<F>(&self, req: &ChatRequest, mut on_event: F) -> Result<()>
    where
        F: FnMut(StreamEvent),
    {
        let url = format!("{}/chat/completions", self.base_url);
        let api_req = ApiChatRequest {
            model: &req.model,
            messages: &req.messages,
            stream: true,
            stream_options: StreamOptions { include_usage: true },
            temperature: req.temperature,
        };

        on_event(StreamEvent::Started {
            model: req.model.clone(),
        });
        let started = Instant::now();

        let resp = self
            .http
            .post(&url)
            .bearer_auth(&self.api_key)
            .json(&api_req)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(AppError::Provider(format!(
                "chat request failed ({status}): {}",
                body.chars().take(500).collect::<String>()
            )));
        }

        on_event(StreamEvent::Connected);

        let mut stream = resp.bytes_stream();
        let mut buf: Vec<u8> = Vec::with_capacity(8 * 1024);
        let mut metrics = Metrics::default();
        let mut first_token_at: Option<Instant> = None;
        let mut completion_chars: usize = 0;
        let mut finish_reason: Option<String> = None;
        let mut done = false;

        while let Some(chunk) = stream.next().await {
            buf.extend_from_slice(&chunk?);

            // SSE events are newline-delimited; 0x0A never occurs inside a
            // multi-byte UTF-8 sequence, so splitting on it is safe.
            loop {
                let Some(pos) = buf.iter().position(|&b| b == b'\n') else {
                    break;
                };
                let raw: Vec<u8> = buf.drain(..=pos).collect();
                let line = String::from_utf8_lossy(&raw);
                let line = line.trim();

                let Some(payload) = line.strip_prefix("data:") else {
                    continue; // comments, blank lines, `event:` lines
                };
                let payload = payload.trim();
                if payload.is_empty() {
                    continue;
                }
                if payload == "[DONE]" {
                    done = true;
                    break;
                }

                // Tolerate keep-alive noise / partial frames.
                let parsed: ChatChunk = match serde_json::from_str(payload) {
                    Ok(c) => c,
                    Err(_) => continue,
                };

                if let Some(usage) = parsed.usage {
                    metrics.prompt_tokens = usage.prompt_tokens.or(metrics.prompt_tokens);
                    metrics.completion_tokens =
                        usage.completion_tokens.or(metrics.completion_tokens);
                    metrics.total_tokens = usage.total_tokens.or(metrics.total_tokens);
                    metrics.reasoning_tokens = usage
                        .completion_tokens_details
                        .and_then(|d| d.reasoning_tokens)
                        .or(metrics.reasoning_tokens);
                }

                for choice in parsed.choices {
                    if let Some(fr) = choice.finish_reason {
                        finish_reason = Some(fr);
                    }
                    let delta = choice.delta;

                    if let Some(text) = delta.reasoning_content {
                        if !text.is_empty() {
                            mark_first_token(&started, &mut first_token_at, &mut metrics, &mut on_event);
                            on_event(StreamEvent::Reasoning { delta: text });
                        }
                    }
                    if let Some(text) = delta.content {
                        if !text.is_empty() {
                            mark_first_token(&started, &mut first_token_at, &mut metrics, &mut on_event);
                            completion_chars += text.chars().count();
                            on_event(StreamEvent::Content { delta: text });
                        }
                    }
                    if let Some(calls) = delta.tool_calls {
                        for call in calls {
                            let (name, arguments) = call
                                .function
                                .map(|f| (f.name.unwrap_or_default(), f.arguments.unwrap_or_default()))
                                .unwrap_or_default();
                            on_event(StreamEvent::ToolCall {
                                id: call.id.unwrap_or_default(),
                                name,
                                arguments,
                            });
                        }
                    }
                }
            }
            if done {
                break;
            }
        }

        // Finalise metrics.
        let elapsed = started.elapsed();
        metrics.elapsed_ms = Some(elapsed.as_millis() as u64);
        let stream_secs = first_token_at
            .map(|t| t.elapsed().as_secs_f64())
            .unwrap_or_else(|| elapsed.as_secs_f64());
        if stream_secs > 0.0 {
            // Prefer real token counts; fall back to ~4 chars/token.
            let tokens = metrics
                .completion_tokens
                .map(|t| t as f64)
                .unwrap_or(completion_chars as f64 / 4.0);
            metrics.tokens_per_sec = Some(tokens / stream_secs);
        }

        on_event(StreamEvent::Done {
            finish_reason,
            metrics,
        });
        Ok(())
    }
}

/// On the first streamed token, record TTFT and push an early metrics update.
fn mark_first_token<F>(
    started: &Instant,
    first_token_at: &mut Option<Instant>,
    metrics: &mut Metrics,
    on_event: &mut F,
) where
    F: FnMut(StreamEvent),
{
    if first_token_at.is_none() {
        *first_token_at = Some(Instant::now());
        metrics.ttft_ms = Some(started.elapsed().as_millis() as u64);
        on_event(StreamEvent::Metrics {
            metrics: metrics.clone(),
        });
    }
}
