// TypeScript mirror of the Rust backend types, plus frontend view models.

// ---- backend mirror (src-tauri/src/*) ----

export interface Conversation {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
}

export interface Turn {
  id: string;
  conversation_id: string;
  prompt: string;
  created_at: number;
}

export interface Run {
  id: string;
  turn_id: string;
  model: string;
  content: string;
  reasoning: string | null;
  metrics: string | null; // JSON of Metrics
  raw: string | null; // JSON array of {at_ms, data}
  finish_reason: string | null;
  error: string | null;
  status: "ok" | "error" | string;
  created_at: number;
}

export interface TurnWithRuns {
  turn: Turn;
  runs: Run[];
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

/** Events streamed from the backend over a Tauri Channel during a run. */
export type StreamEvent =
  | { kind: "started"; model: string }
  | { kind: "connected" }
  | { kind: "raw_frame"; at_ms: number; data: string }
  | { kind: "reasoning"; delta: string }
  | { kind: "content"; delta: string }
  | { kind: "tool_call"; id: string; name: string; arguments: string }
  | { kind: "metrics"; metrics: Metrics }
  | { kind: "done"; finish_reason: string | null; metrics: Metrics }
  | { kind: "error"; message: string };

export interface RawFrame {
  at_ms: number;
  data: string;
}

export interface Settings {
  base_url: string;
  api_key: string;
  default_model: string;
  theme: string;
}

// ---- frontend view models ----

export type RunStatus =
  | "starting"
  | "connected"
  | "streaming"
  | "done"
  | "error";

/** One streamed-content chunk: `n` characters arrived at `t` ms after start. */
export interface RateSample {
  t: number;
  n: number;
}

/** A run as the UI tracks it — live (with timestamps) or reloaded (from metrics). */
export interface RunView {
  id: string;
  model: string;
  status: RunStatus;
  content: string;
  reasoning: string;
  metrics: Metrics;
  rawFrames: RawFrame[];
  finishReason: string | null;
  error: string | null;
  /** performance.now() timestamps — null for reloaded runs. */
  startedAt: number | null;
  connectedAt: number | null;
  firstTokenAt: number | null;
  doneAt: number | null;
  /** Live throughput samples — empty for reloaded runs. */
  rateSamples: RateSample[];
}

export interface TurnView {
  id: string;
  prompt: string;
  created_at: number;
  runs: RunView[];
}
