import { useAppStore } from "../store/appStore";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";
import { ModelPicker } from "./ModelPicker";

function EmptyState() {
  return (
    <div className="empty-state">
      <div className="empty-mark">✦</div>
      <h1>Maple</h1>
      <p>
        A fast, transparent LLM client. Ask anything — watch it reason, stream,
        and report its timings as it goes.
      </p>
    </div>
  );
}

export function ChatView() {
  const currentId = useAppStore((s) => s.currentId);
  const title = useAppStore(
    (s) => s.conversations.find((c) => c.id === s.currentId)?.title,
  );
  const isEmpty = useAppStore(
    (s) => s.messages.length === 0 && s.streaming == null,
  );

  return (
    <div className="chat-view">
      <div className="chat-header">
        <h2 className="chat-title">
          {currentId ? title ?? "Chat" : "New chat"}
        </h2>
        <ModelPicker />
      </div>
      {isEmpty ? <EmptyState /> : <MessageList />}
      <Composer />
    </div>
  );
}
