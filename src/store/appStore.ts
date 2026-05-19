// Central application state (Zustand).
//
// Performance note: streamed token deltas are coalesced with
// requestAnimationFrame so React re-renders at most once per frame, no matter
// how fast the provider streams.

import { create } from "zustand";
import { api } from "../lib/api";
import { titleFrom } from "../lib/format";
import type {
  Conversation,
  Metrics,
  Settings,
  StoredMessage,
  StreamEvent,
} from "../lib/types";

export type TurnStatus =
  | "starting"
  | "connected"
  | "streaming"
  | "done"
  | "error";

export interface TimelineEvent {
  /** ms since the turn started */
  t: number;
  label: string;
  tone: "info" | "good" | "warn" | "bad";
}

export interface ToolCallView {
  id: string;
  name: string;
  arguments: string;
}

/** The in-flight assistant turn. Null when idle. */
export interface StreamingTurn {
  status: TurnStatus;
  model: string;
  content: string;
  reasoning: string;
  toolCalls: ToolCallView[];
  timeline: TimelineEvent[];
  metrics: Metrics;
  startedAt: number;
  error: string | null;
}

const DEFAULT_SETTINGS: Settings = {
  base_url: "",
  api_key: "",
  default_model: "",
  theme: "dark",
};

interface AppState {
  ready: boolean;
  view: "chat" | "settings";
  conversations: Conversation[];
  currentId: string | null;
  messages: StoredMessage[];
  streaming: StreamingTurn | null;
  settings: Settings;
  models: string[];
  modelsError: string | null;
  loadingModels: boolean;
  selectedModel: string;
  sidebarCollapsed: boolean;

  init: () => Promise<void>;
  setView: (v: "chat" | "settings") => void;
  toggleSidebar: () => void;
  selectConversation: (id: string) => Promise<void>;
  newConversation: () => void;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  setModel: (m: string) => void;
  refreshModels: () => Promise<void>;
  saveSettings: (s: Settings) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
}

function applyTheme(theme: string) {
  document.documentElement.dataset.theme = theme === "light" ? "light" : "dark";
}

function bumpConversation(list: Conversation[], id: string): Conversation[] {
  const idx = list.findIndex((c) => c.id === id);
  if (idx < 0) return list;
  const updated = { ...list[idx], updated_at: Date.now() };
  return [updated, ...list.slice(0, idx), ...list.slice(idx + 1)];
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  view: "chat",
  conversations: [],
  currentId: null,
  messages: [],
  streaming: null,
  settings: DEFAULT_SETTINGS,
  models: [],
  modelsError: null,
  loadingModels: false,
  selectedModel: "",
  sidebarCollapsed: false,

  init: async () => {
    try {
      const settings = await api.getSettings();
      applyTheme(settings.theme);
      set({ settings, selectedModel: settings.default_model });
    } catch (e) {
      console.error("load settings failed", e);
    }
    try {
      set({ conversations: await api.listConversations() });
    } catch (e) {
      console.error("load conversations failed", e);
    }
    set({ ready: true });
    void get().refreshModels();
  },

  setView: (v) => set({ view: v }),

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  selectConversation: async (id) => {
    set({ currentId: id, view: "chat", messages: [], streaming: null });
    const conv = get().conversations.find((c) => c.id === id);
    if (conv?.model) set({ selectedModel: conv.model });
    try {
      const messages = await api.getMessages(id);
      if (get().currentId === id) set({ messages });
    } catch (e) {
      console.error("load messages failed", e);
    }
  },

  newConversation: () =>
    set({ currentId: null, messages: [], streaming: null, view: "chat" }),

  deleteConversation: async (id) => {
    try {
      await api.deleteConversation(id);
    } catch (e) {
      console.error("delete conversation failed", e);
      return;
    }
    set((s) => {
      const wasCurrent = s.currentId === id;
      return {
        conversations: s.conversations.filter((c) => c.id !== id),
        currentId: wasCurrent ? null : s.currentId,
        messages: wasCurrent ? [] : s.messages,
        streaming: wasCurrent ? null : s.streaming,
      };
    });
  },

  renameConversation: async (id, title) => {
    const clean = title.trim();
    if (!clean) return;
    try {
      await api.renameConversation(id, clean);
      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === id ? { ...c, title: clean } : c,
        ),
      }));
    } catch (e) {
      console.error("rename conversation failed", e);
    }
  },

  setModel: (m) => set({ selectedModel: m }),

  refreshModels: async () => {
    set({ loadingModels: true, modelsError: null });
    try {
      set({ models: await api.listModels(), loadingModels: false });
    } catch (e) {
      set({ loadingModels: false, modelsError: String(e) });
    }
  },

  saveSettings: async (next) => {
    await api.updateSettings(next);
    applyTheme(next.theme);
    set((s) => ({
      settings: next,
      selectedModel: s.selectedModel || next.default_model,
    }));
    void get().refreshModels();
  },

  sendMessage: async (rawText) => {
    const text = rawText.trim();
    if (!text) return;

    const s0 = get();
    const busy =
      s0.streaming != null &&
      s0.streaming.status !== "done" &&
      s0.streaming.status !== "error";
    if (busy) return;

    const model = s0.selectedModel || s0.settings.default_model;
    if (!model) {
      set({
        streaming: {
          status: "error",
          model: "",
          content: "",
          reasoning: "",
          toolCalls: [],
          timeline: [],
          metrics: {},
          startedAt: performance.now(),
          error: "No model selected — choose one in Settings.",
        },
      });
      return;
    }

    // Create a conversation lazily on the first message.
    let convId = s0.currentId;
    if (!convId) {
      try {
        const conv = await api.createConversation(titleFrom(text), model);
        set((s) => ({
          conversations: [conv, ...s.conversations],
          currentId: conv.id,
          messages: [],
        }));
        convId = conv.id;
      } catch (e) {
        console.error("create conversation failed", e);
        return;
      }
    }

    // Optimistic user message.
    const tempId = `temp-${Date.now()}`;
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id: tempId,
          conversation_id: convId!,
          role: "user",
          content: text,
          reasoning: null,
          metrics: null,
          created_at: Date.now(),
        },
      ],
    }));

    const startedAt = performance.now();
    set({
      streaming: {
        status: "starting",
        model,
        content: "",
        reasoning: "",
        toolCalls: [],
        timeline: [{ t: 0, label: "Request sent", tone: "info" }],
        metrics: {},
        startedAt,
        error: null,
      },
    });

    // --- render batching: one update per animation frame ---
    let pendingContent = "";
    let pendingReasoning = "";
    let frame: number | null = null;
    const flush = () => {
      frame = null;
      if (!pendingContent && !pendingReasoning) return;
      const c = pendingContent;
      const r = pendingReasoning;
      pendingContent = "";
      pendingReasoning = "";
      set((s) =>
        s.streaming
          ? {
              streaming: {
                ...s.streaming,
                content: s.streaming.content + c,
                reasoning: s.streaming.reasoning + r,
              },
            }
          : {},
      );
    };
    const schedule = () => {
      if (frame == null) frame = requestAnimationFrame(flush);
    };

    const elapsed = () => Math.round(performance.now() - startedAt);
    const addTimeline = (label: string, tone: TimelineEvent["tone"]) =>
      set((s) =>
        s.streaming
          ? {
              streaming: {
                ...s.streaming,
                timeline: [
                  ...s.streaming.timeline,
                  { t: elapsed(), label, tone },
                ],
              },
            }
          : {},
      );
    const markStreaming = () => {
      const st = get().streaming;
      if (st && st.status !== "streaming") {
        set({ streaming: { ...st, status: "streaming" } });
        addTimeline("First token", "good");
      }
    };

    const onEvent = (e: StreamEvent) => {
      switch (e.kind) {
        case "started":
          break;
        case "connected":
          set((s) =>
            s.streaming
              ? { streaming: { ...s.streaming, status: "connected" } }
              : {},
          );
          addTimeline("Connected", "info");
          break;
        case "reasoning":
          markStreaming();
          pendingReasoning += e.delta;
          schedule();
          break;
        case "content":
          markStreaming();
          pendingContent += e.delta;
          schedule();
          break;
        case "tool_call":
          set((s) =>
            s.streaming
              ? {
                  streaming: {
                    ...s.streaming,
                    toolCalls: [
                      ...s.streaming.toolCalls,
                      { id: e.id, name: e.name, arguments: e.arguments },
                    ],
                  },
                }
              : {},
          );
          addTimeline(`Tool · ${e.name || "call"}`, "info");
          break;
        case "metrics":
        case "done":
          set((s) =>
            s.streaming
              ? {
                  streaming: {
                    ...s.streaming,
                    metrics: { ...s.streaming.metrics, ...e.metrics },
                  },
                }
              : {},
          );
          break;
        case "error":
          set((s) =>
            s.streaming
              ? { streaming: { ...s.streaming, status: "error", error: e.message } }
              : {},
          );
          break;
      }
    };

    try {
      const result = await api.sendMessage(convId, text, model, onEvent);
      if (frame != null) cancelAnimationFrame(frame);
      set((s) => ({
        messages: [
          ...s.messages.filter((m) => m.id !== tempId),
          result.user_message,
          result.assistant_message,
        ],
        streaming: null,
        conversations: bumpConversation(s.conversations, convId!),
      }));
    } catch (e) {
      if (frame != null) cancelAnimationFrame(frame);
      set((s) => ({
        streaming: s.streaming
          ? { ...s.streaming, status: "error", error: s.streaming.error ?? String(e) }
          : null,
      }));
    }
  },
}));
