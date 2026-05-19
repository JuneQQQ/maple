// Central application state (Zustand) for the glass-box model.
//
// A send creates a turn, then streams one *run* per selected model — N models
// run concurrently (racing). Token deltas from every run are coalesced into a
// single requestAnimationFrame flush, so React re-renders at most once a frame
// no matter how many models stream at once.

import { create } from "zustand";
import { api } from "../lib/api";
import { titleFrom } from "../lib/format";
import type {
  Conversation,
  Metrics,
  RawFrame,
  Run,
  RunView,
  Settings,
  StreamEvent,
  Turn,
  TurnView,
  TurnWithRuns,
} from "../lib/types";

const DEFAULT_SETTINGS: Settings = {
  base_url: "",
  api_key: "",
  default_model: "",
  theme: "dark",
};

interface AppState {
  ready: boolean;
  view: "chat" | "settings";
  sidebarCollapsed: boolean;
  conversations: Conversation[];
  currentId: string | null;
  turns: TurnView[];
  racing: boolean;
  settings: Settings;
  models: string[];
  modelsError: string | null;
  loadingModels: boolean;
  selectedModels: string[];

  init: () => Promise<void>;
  setView: (v: "chat" | "settings") => void;
  toggleSidebar: () => void;
  selectConversation: (id: string) => Promise<void>;
  newConversation: () => void;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  toggleModel: (m: string) => void;
  setSelectedModels: (m: string[]) => void;
  refreshModels: () => Promise<void>;
  saveSettings: (s: Settings) => Promise<void>;
  send: (prompt: string) => Promise<void>;
}

function applyTheme(theme: string) {
  document.documentElement.dataset.theme = theme === "light" ? "light" : "dark";
}

function bump(list: Conversation[], id: string): Conversation[] {
  const i = list.findIndex((c) => c.id === id);
  if (i < 0) return list;
  const updated = { ...list[i], updated_at: Date.now() };
  return [updated, ...list.slice(0, i), ...list.slice(i + 1)];
}

function runToView(run: Run): RunView {
  let metrics: Metrics = {};
  let rawFrames: RawFrame[] = [];
  try {
    if (run.metrics) metrics = JSON.parse(run.metrics) as Metrics;
  } catch {
    /* ignore */
  }
  try {
    if (run.raw) rawFrames = JSON.parse(run.raw) as RawFrame[];
  } catch {
    /* ignore */
  }
  return {
    id: run.id,
    model: run.model,
    status: run.status === "error" ? "error" : "done",
    content: run.content,
    reasoning: run.reasoning ?? "",
    metrics,
    rawFrames,
    finishReason: run.finish_reason,
    error: run.error,
    startedAt: null,
    connectedAt: null,
    firstTokenAt: null,
    doneAt: null,
    rateSamples: [],
  };
}

function toTurnView(tw: TurnWithRuns): TurnView {
  return {
    id: tw.turn.id,
    prompt: tw.turn.prompt,
    created_at: tw.turn.created_at,
    runs: tw.runs.map(runToView),
  };
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  view: "chat",
  sidebarCollapsed: false,
  conversations: [],
  currentId: null,
  turns: [],
  racing: false,
  settings: DEFAULT_SETTINGS,
  models: [],
  modelsError: null,
  loadingModels: false,
  selectedModels: [],

  init: async () => {
    try {
      const settings = await api.getSettings();
      applyTheme(settings.theme);
      set({
        settings,
        selectedModels: settings.default_model ? [settings.default_model] : [],
      });
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
    set({ currentId: id, view: "chat", turns: [] });
    try {
      const turns = await api.getTurns(id);
      if (get().currentId === id) set({ turns: turns.map(toTurnView) });
    } catch (e) {
      console.error("load turns failed", e);
    }
  },

  newConversation: () => set({ currentId: null, turns: [], view: "chat" }),

  deleteConversation: async (id) => {
    try {
      await api.deleteConversation(id);
    } catch (e) {
      console.error("delete failed", e);
      return;
    }
    set((s) => {
      const wasCurrent = s.currentId === id;
      return {
        conversations: s.conversations.filter((c) => c.id !== id),
        currentId: wasCurrent ? null : s.currentId,
        turns: wasCurrent ? [] : s.turns,
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
      console.error("rename failed", e);
    }
  },

  toggleModel: (m) =>
    set((s) => ({
      selectedModels: s.selectedModels.includes(m)
        ? s.selectedModels.filter((x) => x !== m)
        : [...s.selectedModels, m],
    })),

  setSelectedModels: (m) => set({ selectedModels: m }),

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
      selectedModels:
        s.selectedModels.length > 0
          ? s.selectedModels
          : next.default_model
            ? [next.default_model]
            : [],
    }));
    void get().refreshModels();
  },

  send: async (promptText) => {
    const text = promptText.trim();
    if (!text) return;
    const s0 = get();
    if (s0.racing) return;

    const models = (
      s0.selectedModels.length > 0
        ? s0.selectedModels
        : [s0.settings.default_model]
    ).filter((m) => m.trim().length > 0);
    if (models.length === 0) {
      console.error("no model selected");
      return;
    }

    // Ensure a conversation.
    let convId = s0.currentId;
    if (!convId) {
      try {
        const conv = await api.createConversation(titleFrom(text));
        set((s) => ({
          conversations: [conv, ...s.conversations],
          currentId: conv.id,
          turns: [],
        }));
        convId = conv.id;
      } catch (e) {
        console.error("create conversation failed", e);
        return;
      }
    }

    // Create the turn.
    let turn: Turn;
    try {
      turn = await api.createTurn(convId, text);
    } catch (e) {
      console.error("create turn failed", e);
      return;
    }

    // Optimistic turn view — one "starting" run per model.
    const startedAt = performance.now();
    const runViews: RunView[] = models.map((model, i) => ({
      id: `live-${turn.id}-${i}`,
      model,
      status: "starting",
      content: "",
      reasoning: "",
      metrics: {},
      rawFrames: [],
      finishReason: null,
      error: null,
      startedAt,
      connectedAt: null,
      firstTokenAt: null,
      doneAt: null,
      rateSamples: [],
    }));
    set((s) => ({
      racing: true,
      turns: [
        ...s.turns,
        { id: turn.id, prompt: text, created_at: turn.created_at, runs: runViews },
      ],
    }));

    // ---- per-frame batching shared across all racing runs ----
    type Pending = {
      content: string;
      reasoning: string;
      rate: { t: number; n: number }[];
      raw: RawFrame[];
    };
    const pending = new Map<string, Pending>();
    let frame: number | null = null;
    const ensure = (id: string): Pending => {
      let p = pending.get(id);
      if (!p) {
        p = { content: "", reasoning: "", rate: [], raw: [] };
        pending.set(id, p);
      }
      return p;
    };
    const flush = () => {
      frame = null;
      if (pending.size === 0) return;
      const snap = new Map(pending);
      pending.clear();
      set((s) => ({
        turns: s.turns.map((t) =>
          t.id !== turn.id
            ? t
            : {
                ...t,
                runs: t.runs.map((r) => {
                  const p = snap.get(r.id);
                  if (!p) return r;
                  return {
                    ...r,
                    content: r.content + p.content,
                    reasoning: r.reasoning + p.reasoning,
                    rateSamples:
                      p.rate.length > 0
                        ? [...r.rateSamples, ...p.rate]
                        : r.rateSamples,
                    rawFrames:
                      p.raw.length > 0
                        ? [...r.rawFrames, ...p.raw]
                        : r.rawFrames,
                  };
                }),
              },
        ),
      }));
    };
    const schedule = () => {
      if (frame == null) frame = requestAnimationFrame(flush);
    };
    const patchRun = (runId: string, fn: (r: RunView) => RunView) => {
      set((s) => ({
        turns: s.turns.map((t) =>
          t.id !== turn.id
            ? t
            : { ...t, runs: t.runs.map((r) => (r.id === runId ? fn(r) : r)) },
        ),
      }));
    };

    const firstToken = new Set<string>();

    const runOne = async (runId: string, model: string) => {
      const onEvent = (e: StreamEvent) => {
        const now = performance.now();
        switch (e.kind) {
          case "connected":
            patchRun(runId, (r) => ({
              ...r,
              status: r.status === "starting" ? "connected" : r.status,
              connectedAt: r.connectedAt ?? now,
            }));
            break;
          case "content":
          case "reasoning": {
            if (!firstToken.has(runId)) {
              firstToken.add(runId);
              patchRun(runId, (r) => ({
                ...r,
                status: "streaming",
                firstTokenAt: r.firstTokenAt ?? now,
              }));
            }
            const p = ensure(runId);
            if (e.kind === "content") {
              p.content += e.delta;
              p.rate.push({ t: now - startedAt, n: e.delta.length });
            } else {
              p.reasoning += e.delta;
            }
            schedule();
            break;
          }
          case "raw_frame":
            ensure(runId).raw.push({ at_ms: e.at_ms, data: e.data });
            schedule();
            break;
          case "metrics":
          case "done":
            patchRun(runId, (r) => ({
              ...r,
              metrics: { ...r.metrics, ...e.metrics },
            }));
            break;
          case "error":
            patchRun(runId, (r) => ({
              ...r,
              status: "error",
              error: e.message,
            }));
            break;
          default:
            break;
        }
      };

      try {
        const finalRun = await api.sendRun(turn.id, model, onEvent);
        patchRun(runId, (r) => ({
          ...r,
          status: finalRun.status === "error" ? "error" : "done",
          doneAt: r.doneAt ?? performance.now(),
          error: finalRun.error ?? r.error,
          finishReason: finalRun.finish_reason ?? r.finishReason,
        }));
      } catch (e) {
        patchRun(runId, (r) => ({
          ...r,
          status: "error",
          error: r.error ?? String(e),
          doneAt: r.doneAt ?? performance.now(),
        }));
      }
    };

    await Promise.allSettled(runViews.map((r) => runOne(r.id, r.model)));
    if (frame != null) cancelAnimationFrame(frame);
    flush();
    set((s) => ({
      racing: false,
      conversations: bump(s.conversations, convId as string),
    }));
  },
}));
