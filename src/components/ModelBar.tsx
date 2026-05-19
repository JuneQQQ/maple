import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, RefreshCw, Search, X } from "lucide-react";
import clsx from "clsx";
import { useAppStore } from "../store/appStore";

const MAX_VISIBLE = 200;

/** Selected-model chips + a picker. 2+ models means the next send is a race. */
export function ModelBar() {
  const selected = useAppStore((s) => s.selectedModels);
  const models = useAppStore((s) => s.models);
  const loading = useAppStore((s) => s.loadingModels);
  const toggleModel = useAppStore((s) => s.toggleModel);
  const refreshModels = useAppStore((s) => s.refreshModels);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? models.filter((m) => m.toLowerCase().includes(q))
      : models;
    return list.slice(0, MAX_VISIBLE);
  }, [models, query]);

  return (
    <div className="model-bar" ref={ref}>
      {selected.map((m) => (
        <span className="model-chip" key={m}>
          <span className="model-chip-name" title={m}>
            {m}
          </span>
          <button
            className="model-chip-x"
            title="Remove"
            onClick={() => toggleModel(m)}
          >
            <X size={11} />
          </button>
        </span>
      ))}

      <button className="model-add" onClick={() => setOpen((o) => !o)}>
        <Plus size={13} />
        model
      </button>

      {selected.length >= 2 && (
        <span className="race-badge">⚡ race ×{selected.length}</span>
      )}

      {open && (
        <div className="model-pop">
          <div className="model-search">
            <Search size={14} />
            <input
              autoFocus
              placeholder={`Search ${models.length || ""} models…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              className="icon-btn"
              title="Refresh models"
              onClick={() => void refreshModels()}
            >
              <RefreshCw size={13} className={clsx(loading && "spin")} />
            </button>
          </div>
          <div className="model-options">
            {loading && <div className="model-empty">Loading models…</div>}
            {!loading && filtered.length === 0 && (
              <div className="model-empty">No matching model.</div>
            )}
            {filtered.map((m) => {
              const on = selected.includes(m);
              return (
                <button
                  key={m}
                  className={clsx("model-option", on && "selected")}
                  onClick={() => toggleModel(m)}
                >
                  <span className="model-option-name">{m}</span>
                  {on && <Check size={14} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
