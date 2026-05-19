import { useState } from "react";
import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import type { RawFrame } from "../lib/types";
import { formatMs } from "../lib/format";

/** "View source" for the AI call — the raw SSE frames, with arrival times. */
export function RawInspector({ frames }: { frames: RawFrame[] }) {
  const [open, setOpen] = useState(false);
  if (frames.length === 0) return null;

  return (
    <div className="raw-inspector">
      <button className="raw-toggle" onClick={() => setOpen((o) => !o)}>
        <ChevronRight
          size={12}
          className={clsx("raw-chev", open && "open")}
        />
        raw stream · {frames.length} frame{frames.length === 1 ? "" : "s"}
      </button>
      {open && (
        <div className="raw-frames">
          {frames.map((f, i) => (
            <div className="raw-frame" key={i}>
              <span className="raw-at">{formatMs(f.at_ms)}</span>
              <code className="raw-data">{f.data}</code>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
