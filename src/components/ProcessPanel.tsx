import { memo, useState } from "react";
import type { ReactNode } from "react";
import clsx from "clsx";
import {
  Activity,
  Brain,
  ChevronRight,
  Clock,
  Hash,
  Wrench,
  Zap,
} from "lucide-react";
import type { Metrics } from "../lib/types";
import type { TimelineEvent, ToolCallView, TurnStatus } from "../store/appStore";
import { formatMs, formatRate, formatTokens } from "../lib/format";

interface ProcessPanelProps {
  reasoning: string;
  toolCalls: ToolCallView[];
  timeline: TimelineEvent[];
  streaming: boolean;
  status?: TurnStatus;
}

/**
 * The "intermediate process" display: reasoning stream, live timeline and
 * tool calls for one assistant turn. Collapsible; auto-expanded while streaming.
 */
function ProcessPanelBase({
  reasoning,
  toolCalls,
  timeline,
  streaming,
  status,
}: ProcessPanelProps) {
  const showTimeline = streaming && timeline.length > 0;
  const hasContent = reasoning.length > 0 || toolCalls.length > 0 || showTimeline;
  const [expanded, setExpanded] = useState(streaming);

  if (!hasContent) return null;

  const label = reasoning ? "Reasoning" : streaming ? "Process" : "Tool calls";

  return (
    <div className={clsx("process-panel", streaming && "is-streaming")}>
      <button className="process-head" onClick={() => setExpanded((v) => !v)}>
        <ChevronRight
          size={13}
          className={clsx("process-chevron", expanded && "open")}
        />
        <Brain size={13} />
        <span className="process-label">{label}</span>
        {reasoning.length > 0 && (
          <span className="process-meta">
            {reasoning.length.toLocaleString()} chars
          </span>
        )}
        {streaming && status !== "error" && (
          <span className="process-live">
            <span className="live-dot" />
            live
          </span>
        )}
      </button>

      {expanded && (
        <div className="process-body">
          {showTimeline && (
            <ol className="timeline">
              {timeline.map((ev, i) => (
                <li key={i} className={clsx("tl-row", `tone-${ev.tone}`)}>
                  <span className="tl-dot" />
                  <span className="tl-label">{ev.label}</span>
                  <span className="tl-time">{formatMs(ev.t)}</span>
                </li>
              ))}
            </ol>
          )}
          {reasoning && <div className="reasoning-text">{reasoning}</div>}
          {toolCalls.map((tc, i) => (
            <div className="tool-call" key={tc.id || i}>
              <div className="tool-call-head">
                <Wrench size={12} />
                <span>{tc.name || "tool"}</span>
              </div>
              {tc.arguments && (
                <pre className="tool-call-args">{tc.arguments}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const ProcessPanel = memo(ProcessPanelBase);

// --- metrics bar -----------------------------------------------------------

interface Chip {
  icon: ReactNode;
  label: string;
  title: string;
}

function MetricsBarBase({ metrics }: { metrics: Metrics }) {
  const chips: Chip[] = [];
  if (metrics.ttft_ms != null) {
    chips.push({
      icon: <Zap size={12} />,
      label: formatMs(metrics.ttft_ms),
      title: "Time to first token",
    });
  }
  if (metrics.tokens_per_sec != null) {
    chips.push({
      icon: <Activity size={12} />,
      label: formatRate(metrics.tokens_per_sec),
      title: "Throughput",
    });
  }
  if (metrics.elapsed_ms != null) {
    chips.push({
      icon: <Clock size={12} />,
      label: formatMs(metrics.elapsed_ms),
      title: "Total time",
    });
  }
  if (metrics.total_tokens != null) {
    chips.push({
      icon: <Hash size={12} />,
      label: `${formatTokens(metrics.total_tokens)} tok`,
      title:
        `${metrics.prompt_tokens ?? "?"} prompt + ` +
        `${metrics.completion_tokens ?? "?"} completion` +
        (metrics.reasoning_tokens
          ? ` (${metrics.reasoning_tokens} reasoning)`
          : ""),
    });
  }
  if (chips.length === 0) return null;

  return (
    <div className="metrics-bar">
      {chips.map((c, i) => (
        <span className="metric-chip" key={i} title={c.title}>
          {c.icon}
          <span>{c.label}</span>
        </span>
      ))}
    </div>
  );
}

export const MetricsBar = memo(MetricsBarBase);
