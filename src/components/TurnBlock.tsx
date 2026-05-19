import { memo } from "react";
import clsx from "clsx";
import type { TurnView } from "../lib/types";
import { runPhases } from "../lib/trace";
import { TraceCard } from "./TraceCard";

/** One turn: the prompt, then its run(s) as side-by-side racing lanes. */
function TurnBlockBase({ turn }: { turn: TurnView }) {
  const raced = turn.runs.length > 1;

  // Shared time axis across the turn's runs so lanes are comparable.
  const axisMax = Math.max(1, ...turn.runs.map((r) => runPhases(r).total));

  // The finished run with the shortest total wins the turn.
  let leaderId: string | null = null;
  let best = Infinity;
  for (const r of turn.runs) {
    if (r.status === "done") {
      const total = runPhases(r).total;
      if (total < best) {
        best = total;
        leaderId = r.id;
      }
    }
  }

  return (
    <div className="turn-block">
      <div className="turn-prompt">
        <span className="turn-prompt-mark">▸</span>
        <span className="turn-prompt-text">{turn.prompt}</span>
        {raced && <span className="turn-race-tag">race ×{turn.runs.length}</span>}
      </div>
      <div className={clsx("turn-runs", raced && "raced")}>
        {turn.runs.map((r) => (
          <TraceCard
            key={r.id}
            run={r}
            axisMax={axisMax}
            raced={raced}
            leader={r.id === leaderId}
          />
        ))}
      </div>
    </div>
  );
}

export const TurnBlock = memo(TurnBlockBase);
