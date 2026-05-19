// Derivations for the trace visualizations: waterfall phases + rate curve.

import type { RateSample, RunView } from "./types";

export interface Phases {
  /** request sent → response headers (ms) */
  connect: number;
  /** connected → first token — the model "thinking" gap (ms) */
  wait: number;
  /** first token → done — the streaming window (ms) */
  generate: number;
  /** total wall time (ms) */
  total: number;
}

/**
 * Waterfall phases for a run. Live runs use performance.now() timestamps;
 * reloaded runs fall back to persisted metrics (connect folded into wait).
 */
export function runPhases(run: RunView): Phases {
  if (run.startedAt != null) {
    const end = run.doneAt ?? performance.now();
    const connect =
      run.connectedAt != null ? run.connectedAt - run.startedAt : 0;
    const afterConnect = run.connectedAt ?? run.startedAt;
    const wait =
      run.firstTokenAt != null
        ? run.firstTokenAt - afterConnect
        : end - afterConnect;
    const generate = run.firstTokenAt != null ? end - run.firstTokenAt : 0;
    return {
      connect: Math.max(0, connect),
      wait: Math.max(0, wait),
      generate: Math.max(0, generate),
      total: Math.max(0, end - run.startedAt),
    };
  }
  // Reloaded run — derive from stored metrics.
  const ttft = run.metrics.ttft_ms ?? 0;
  const elapsed = run.metrics.elapsed_ms ?? ttft;
  return {
    connect: 0,
    wait: ttft,
    generate: Math.max(0, elapsed - ttft),
    total: Math.max(ttft, elapsed),
  };
}

/**
 * Bucket streamed-content samples into a chars/sec curve for the sparkline.
 * Returns one value per bucket.
 */
export function rateCurve(samples: RateSample[], buckets = 48): number[] {
  if (samples.length < 2) return [];
  const maxT = samples[samples.length - 1].t;
  if (maxT <= 0) return [];
  const width = maxT / buckets;
  const out = new Array<number>(buckets).fill(0);
  for (const s of samples) {
    const i = Math.min(buckets - 1, Math.max(0, Math.floor(s.t / width)));
    out[i] += s.n;
  }
  return out.map((chars) => (chars / width) * 1000);
}
