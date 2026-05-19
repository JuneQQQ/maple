import { memo } from "react";
import { Markdown } from "./Markdown";
import { ProcessPanel, MetricsBar } from "./ProcessPanel";
import type { Metrics } from "../lib/types";
import type { TimelineEvent, ToolCallView, TurnStatus } from "../store/appStore";

export interface MessageItemProps {
  role: string;
  content: string;
  reasoning?: string | null;
  metrics?: Metrics | null;
  toolCalls?: ToolCallView[];
  timeline?: TimelineEvent[];
  streaming?: boolean;
  status?: TurnStatus;
  error?: string | null;
}

function MessageItemBase(props: MessageItemProps) {
  const {
    role,
    content,
    reasoning,
    metrics,
    toolCalls,
    timeline,
    streaming = false,
    status,
    error,
  } = props;

  if (role === "user") {
    return (
      <div className="msg msg-user">
        <div className="msg-bubble">{content}</div>
      </div>
    );
  }

  const waiting = streaming && !content && !error && status !== "error";
  const waitingLabel =
    status === "starting"
      ? "Connecting…"
      : status === "connected"
        ? "Waiting for first token…"
        : "Generating…";

  return (
    <div className="msg msg-assistant">
      <div className="msg-avatar">✦</div>
      <div className="msg-body">
        <ProcessPanel
          reasoning={reasoning ?? ""}
          toolCalls={toolCalls ?? []}
          timeline={timeline ?? []}
          streaming={streaming}
          status={status}
        />
        {error ? (
          <div className="msg-error">⚠ {error}</div>
        ) : content ? (
          <div className="msg-content">
            <Markdown text={content} />
          </div>
        ) : waiting ? (
          <div className="msg-waiting">
            <span className="dots">
              <i />
              <i />
              <i />
            </span>
            {waitingLabel}
          </div>
        ) : null}
        {metrics && <MetricsBar metrics={metrics} />}
      </div>
    </div>
  );
}

export const MessageItem = memo(MessageItemBase);
