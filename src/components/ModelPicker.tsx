import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, RefreshCw, Search } from "lucide-react";
import clsx from "clsx";
import { useAppStore } from "../store/appStore";

const MAX_VISIBLE = 200;

export function ModelPicker() {
  const models = useAppStore((s) => s.models);
  const loading = useAppStore((s) => s.loadingModels);
  const selected = useAppStore((s) => s.selectedModel);
  const setModel = useAppStore((s) => s.setModel);
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
    <div className="model-picker" ref={ref}>
      <button className="model-btn" onClick={() => setOpen((v) => !v)}>
        <span className="model-name">{selected || "Select model"}</span>
        <ChevronDown size={14} />
      </button>

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
            {filtered.map((m) => (
              <button
                key={m}
                className={clsx("model-option", m === selected && "selected")}
                onClick={() => {
                  setModel(m);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <span className="model-option-name">{m}</span>
                {m === selected && <Check size={14} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
