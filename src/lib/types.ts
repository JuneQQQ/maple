// TypeScript mirror of the Rust backend types (src-tauri/src/*).
// Keep these in sync with `db.rs`, `llm.rs` and `commands.rs`.

export interface Conversation {
  id: string;
  title: string;
  model: string;
  created_at: number;
  updated_at: number;
}

export interface StoredMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system" | string;
  content: string;
  reasoning: string | null;
  /** JSON-encoded `Metrics`, present on assistant messages. */
  metrics: string | null;
  created_at: number;
}

export interface Metrics {
  ttft_ms?: number | null;
  elapsed_ms?: number | null;
  tokens_per_sec?: number | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  reasoning_tokens?: number | null;
  total_tokens?: number | null;
}

/** Events streamed from the backend over a Tauri Channel during a turn. */
export type StreamEvent =
  | { kind: "started"; model: string }
  | { kind: "connected" }
  | { kind: "reasoning"; delta: string }
  | { kind: "content"; delta: string }
  | { kind: "tool_call"; id: string; name: string; arguments: string }
  | { kind: "metrics"; metrics: Metrics }
  | { kind: "done"; finish_reason: string | null; metrics: Metrics }
  | { kind: "error"; message: string };

export interface SendResult {
  user_message: StoredMessage;
  assistant_message: StoredMessage;
}

export interface Settings {
  base_url: string;
  api_key: string;
  default_model: string;
  theme: string;
}
