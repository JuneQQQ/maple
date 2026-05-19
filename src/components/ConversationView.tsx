import { useEffect, useRef } from "react";
import { useAppStore } from "../store/appStore";
import { TurnBlock } from "./TurnBlock";
import { Composer } from "./Composer";

const EXAMPLES = [
  "Explain how HTTPS works, briefly.",
  "Write a haiku about autumn.",
  "Show me quicksort in Rust.",
  "What is the CAP theorem?",
];

function EmptyState() {
  const send = useAppStore((s) => s.send);
  return (
    <div className="empty-state">
      <div className="empty-mark">✦</div>
      <h1>Maple</h1>
      <p>
        Every answer is a <strong>performance trace</strong> — connect, wait,
        generate, token by token. Pick one model, or several to race.
      </p>
      <div className="empty-examples">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            className="example-chip"
            onClick={() => void send(ex)}
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ConversationView() {
  const turns = useAppStore((s) => s.turns);
  const currentId = useAppStore((s) => s.currentId);
  const title = useAppStore(
    (s) => s.conversations.find((c) => c.id === s.currentId)?.title,
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  });

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  return (
    <div className="conv-view">
      <div className="conv-header">
        <h2 className="conv-title">
          {currentId ? title ?? "Session" : "New session"}
        </h2>
        <span className="conv-tag">glass-box</span>
      </div>
      <div className="conv-scroll" ref={scrollRef} onScroll={onScroll}>
        {turns.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="turns">
            {turns.map((t) => (
              <TurnBlock key={t.id} turn={t} />
            ))}
          </div>
        )}
      </div>
      <Composer />
    </div>
  );
}
