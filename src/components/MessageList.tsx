import { useEffect, useMemo, useRef } from "react";
import { useAppStore } from "../store/appStore";
import { MessageItem } from "./MessageItem";
import type { Metrics } from "../lib/types";

function parseMetrics(json: string | null): Metrics | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as Metrics;
  } catch {
    return null;
  }
}

export function MessageList() {
  const messages = useAppStore((s) => s.messages);
  const streaming = useAppStore((s) => s.streaming);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  // Parse stored metrics once per change so memoised items stay stable.
  const views = useMemo(
    () => messages.map((m) => ({ message: m, metrics: parseMetrics(m.metrics) })),
    [messages],
  );

  // Keep the view pinned to the bottom unless the user scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  });

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90;
  };

  return (
    <div className="message-list" ref={scrollRef} onScroll={onScroll}>
      <div className="message-list-inner">
        {views.map((v) => (
          <MessageItem
            key={v.message.id}
            role={v.message.role}
            content={v.message.content}
            reasoning={v.message.reasoning}
            metrics={v.metrics}
          />
        ))}
        {streaming && (
          <MessageItem
            role="assistant"
            content={streaming.content}
            reasoning={streaming.reasoning}
            metrics={streaming.metrics}
            toolCalls={streaming.toolCalls}
            timeline={streaming.timeline}
            streaming
            status={streaming.status}
            error={streaming.error}
          />
        )}
      </div>
    </div>
  );
}
