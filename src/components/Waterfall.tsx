import clsx from "clsx";
import type { Phases } from "../lib/trace";
import { formatMs } from "../lib/format";

/**
 * A request-timing waterfall: connect → wait → generate, each phase cascading
 * from where the previous ended. Bars are scaled to `axisMax` (the slowest run
 * in the turn) so racing lanes are directly comparable.
 */
export function Waterfall({
  phases,
  axisMax,
}: {
  phases: Phases;
  axisMax: number;
}) {
  const max = Math.max(axisMax, 1);
  const rows: { key: string; label: string; ms: number; cls: string }[] = [
    { key: "connect", label: "connect", ms: phases.connect, cls: "wf-connect" },
    { key: "wait", label: "wait", ms: phases.wait, cls: "wf-wait" },
    {
      key: "generate",
      label: "generate",
      ms: phases.generate,
      cls: "wf-generate",
    },
  ];

  let offset = 0;
  return (
    <div className="waterfall">
      {rows.map((row) => {
        const left = (offset / max) * 100;
        const width = (row.ms / max) * 100;
        offset += row.ms;
        return (
          <div className="wf-row" key={row.key}>
            <span className="wf-label">{row.label}</span>
            <div className="wf-track">
              <div
                className={clsx("wf-bar", row.cls)}
                style={{
                  marginLeft: `${left}%`,
                  width: `${Math.max(width, 0.5)}%`,
                }}
              />
            </div>
            <span className="wf-ms">{formatMs(row.ms)}</span>
          </div>
        );
      })}
    </div>
  );
}
