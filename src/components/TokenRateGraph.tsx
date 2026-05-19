import { useMemo } from "react";
import type { RateSample } from "../lib/types";
import { rateCurve } from "../lib/trace";

/**
 * A sparkline of streaming throughput (characters/sec) over the generation
 * window — you can watch the model speed up and slow down in real time.
 */
export function TokenRateGraph({ samples }: { samples: RateSample[] }) {
  const curve = useMemo(() => rateCurve(samples), [samples]);
  if (curve.length < 2) return null;

  const W = 100;
  const H = 30;
  const peak = Math.max(...curve, 1);
  const pts = curve.map((v, i) => {
    const x = (i / (curve.length - 1)) * W;
    const y = H - (v / peak) * (H - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const areaPoints = `0,${H} ${pts.join(" ")} ${W},${H}`;

  return (
    <div className="rate-graph">
      <svg
        className="rate-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polygon className="rate-fill" points={areaPoints} />
        <polyline className="rate-line" points={pts.join(" ")} />
      </svg>
      <span className="rate-peak">peak ~{Math.round(peak)} c/s</span>
    </div>
  );
}
