import { memo, useState } from "react";
import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import type { RunView } from "../lib/types";
import { runPhases } from "../lib/trace";
import { formatMs, formatRate, formatTokens } from "../lib/format";
import { Waterfall } from "./Waterfall";
import { TokenRateGraph } from "./TokenRateGraph";
import { RawInspector } from "./RawInspector";
import { Markdown } from "./Markdown";

interface Props {
  run: RunView;
  axisMax: number;
  raced: boolean;
  leader: boolean;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

/** One model's run, rendered as a performance trace. */
function TraceCardBase({ run, axisMax, raced, leader }: Props) {
  const phases = runPhases(run);
  const live =
    run.status === "starting" ||
    run.status === "connected" ||
    run.status === "streaming";
  const [showReasoning, setShowReasoning] = useState(false);
  const m = run.metrics;

  const statusLabel =
    run.status === "starting"
      ? "connecting"
      : run.status === "connected"
        ? "thinking"
        : run.status === "streaming"
          ? "streaming"
          : run.status === "error"
            ? "failed"
            : "done";

  return (
    <div
      className={clsx(
        "trace-card",
        `is-${run.status}`,
        leader && raced && "leader",
      )}
    >
      <header className="tc-head">
        <span className={clsx("tc-dot", `dot-${run.status}`)} />
        <span className="tc-model" title={run.model}>
          {run.model}
        </span>
        {leader && raced && <span className="tc-badge">fastest</span>}
        <span className={clsx("tc-status", `st-${run.status}`)}>
          {statusLabel}
        </span>
      </header>

      <div className="tc-trace">
        <Waterfall phases={phases} axisMax={axisMax} />
        <TokenRateGraph samples={run.rateSamples} />
      </div>

      {run.reasoning && (
        <div className="tc-reasoning">
          <button
            className="disclosure"
            onClick={() => setShowReasoning((v) => !v)}
          >
            <ChevronRight
              size={12}
              className={clsx("disclosure-chev", showReasoning && "open")}
            />
            reasoning
            <span className="disclosure-meta">
              {run.reasoning.length.toLocaleString()} chars
            </span>
          </button>
          {showReasoning && (
            <div className="reasoning-text">{run.reasoning}</div>
          )}
        </div>
      )}

      {run.status === "error" ? (
        <div className="tc-error">⚠ {run.error ?? "request failed"}</div>
      ) : run.content ? (
        <div className="tc-content">
          <Markdown text={run.content} />
        </div>
      ) : live ? (
        <div className="tc-waiting">
          <span className="dots">
            <i />
            <i />
            <i />
          </span>
          {run.status === "streaming"
            ? "generating…"
            : run.status === "connected"
              ? "model is thinking…"
              : "connecting…"}
        </div>
      ) : null}

      <footer className="tc-foot">
        <div className="tc-stats">
          <Stat label="TTFT" value={formatMs(m.ttft_ms)} />
          <Stat label="speed" value={formatRate(m.tokens_per_sec)} />
          <Stat
            label="total"
            value={formatMs(m.elapsed_ms ?? (live ? phases.total : null))}
          />
          <Stat label="tokens" value={formatTokens(m.total_tokens)} />
        </div>
        <RawInspector frames={run.rawFrames} />
      </footer>
    </div>
  );
}

export const TraceCard = memo(TraceCardBase);
