// Typed wrappers over the Tauri command bridge.

import { invoke, Channel } from "@tauri-apps/api/core";
import type {
  Conversation,
  StoredMessage,
  SendResult,
  Settings,
  StreamEvent,
} from "./types";

export const api = {
  listConversations: () => invoke<Conversation[]>("list_conversations"),

  createConversation: (title: string, model: string) =>
    invoke<Conversation>("create_conversation", { title, model }),

  renameConversation: (id: string, title: string) =>
    invoke<void>("rename_conversation", { id, title }),

  deleteConversation: (id: string) =>
    invoke<void>("delete_conversation", { id }),

  getMessages: (conversationId: string) =>
    invoke<StoredMessage[]>("get_messages", { conversationId }),

  getSettings: () => invoke<Settings>("get_settings"),

  updateSettings: (settings: Settings) =>
    invoke<void>("update_settings", { settings }),

  listModels: () => invoke<string[]>("list_models"),

  /**
   * Send a message and stream the reply. `onEvent` fires for every
   * backend StreamEvent; the promise resolves once the turn is persisted.
   */
  sendMessage: (
    conversationId: string,
    text: string,
    model: string,
    onEvent: (event: StreamEvent) => void,
  ): Promise<SendResult> => {
    const channel = new Channel<StreamEvent>();
    channel.onmessage = onEvent;
    return invoke<SendResult>("send_message", {
      conversationId,
      text,
      model,
      onEvent: channel,
    });
  },
};
