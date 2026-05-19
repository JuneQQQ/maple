// Typed wrappers over the Tauri command bridge.

import { invoke, Channel } from "@tauri-apps/api/core";
import type {
  Conversation,
  Run,
  Settings,
  StreamEvent,
  Turn,
  TurnWithRuns,
} from "./types";

export const api = {
  listConversations: () => invoke<Conversation[]>("list_conversations"),

  createConversation: (title: string) =>
    invoke<Conversation>("create_conversation", { title }),

  renameConversation: (id: string, title: string) =>
    invoke<void>("rename_conversation", { id, title }),

  deleteConversation: (id: string) =>
    invoke<void>("delete_conversation", { id }),

  getTurns: (conversationId: string) =>
    invoke<TurnWithRuns[]>("get_turns", { conversationId }),

  createTurn: (conversationId: string, prompt: string) =>
    invoke<Turn>("create_turn", { conversationId, prompt }),

  /**
   * Stream one model's response to a turn. `onEvent` fires for every backend
   * StreamEvent; the promise resolves with the persisted run. Call several of
   * these concurrently on one turn to race models.
   */
  sendRun: (
    turnId: string,
    model: string,
    onEvent: (event: StreamEvent) => void,
  ): Promise<Run> => {
    const channel = new Channel<StreamEvent>();
    channel.onmessage = onEvent;
    return invoke<Run>("send_run", { turnId, model, onEvent: channel });
  },

  getSettings: () => invoke<Settings>("get_settings"),

  updateSettings: (settings: Settings) =>
    invoke<void>("update_settings", { settings }),

  listModels: () => invoke<string[]>("list_models"),
};
