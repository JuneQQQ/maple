import { useState } from "react";
import { ArrowLeft, Check, RefreshCw } from "lucide-react";
import clsx from "clsx";
import { useAppStore } from "../store/appStore";
import type { Settings } from "../lib/types";

export function SettingsView() {
  const settings = useAppStore((s) => s.settings);
  const saveSettings = useAppStore((s) => s.saveSettings);
  const setView = useAppStore((s) => s.setView);
  const models = useAppStore((s) => s.models);
  const loadingModels = useAppStore((s) => s.loadingModels);
  const modelsError = useAppStore((s) => s.modelsError);
  const refreshModels = useAppStore((s) => s.refreshModels);

  const [form, setForm] = useState<Settings>(settings);
  const [saved, setSaved] = useState(false);

  const patch = (p: Partial<Settings>) => {
    setForm((f) => ({ ...f, ...p }));
    setSaved(false);
  };

  const save = async () => {
    await saveSettings(form);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2200);
  };

  return (
    <div className="settings-view">
      <div className="settings-head">
        <button
          className="icon-btn"
          onClick={() => setView("chat")}
          title="Back to chat"
        >
          <ArrowLeft size={16} />
        </button>
        <h2>Settings</h2>
      </div>

      <div className="settings-body">
        <section className="settings-section">
          <h3>Provider</h3>
          <p className="section-note">
            Maple speaks the OpenAI-compatible API. Defaults target DMXAPI.
          </p>

          <label className="field">
            <span className="field-label">API base URL</span>
            <input
              className="field-input"
              value={form.base_url}
              spellCheck={false}
              onChange={(e) => patch({ base_url: e.target.value })}
              placeholder="https://www.dmxapi.cn/v1"
            />
          </label>

          <label className="field">
            <span className="field-label">API key</span>
            <input
              className="field-input"
              type="password"
              value={form.api_key}
              spellCheck={false}
              onChange={(e) => patch({ api_key: e.target.value })}
              placeholder="sk-…"
            />
          </label>

          <label className="field">
            <span className="field-label">
              Default model
              <button
                type="button"
                className="link-btn"
                onClick={() => void refreshModels()}
              >
                <RefreshCw size={11} className={clsx(loadingModels && "spin")} />
                refresh
              </button>
            </span>
            <input
              className="field-input"
              list="settings-model-list"
              value={form.default_model}
              spellCheck={false}
              onChange={(e) => patch({ default_model: e.target.value })}
              placeholder="gpt-5-mini"
            />
            <datalist id="settings-model-list">
              {models.slice(0, 1000).map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            {modelsError ? (
              <span className="field-error">{modelsError}</span>
            ) : models.length > 0 ? (
              <span className="field-hint">
                {models.length} models available
              </span>
            ) : null}
          </label>
        </section>

        <section className="settings-section">
          <h3>Appearance</h3>
          <div className="field">
            <span className="field-label">Theme</span>
            <div className="seg-toggle">
              {(["dark", "light"] as const).map((t) => (
                <button
                  key={t}
                  className={clsx("seg-opt", form.theme === t && "active")}
                  onClick={() => patch({ theme: t })}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </section>

        <button className="save-btn" onClick={() => void save()}>
          {saved ? (
            <>
              <Check size={15} /> Saved
            </>
          ) : (
            "Save settings"
          )}
        </button>
      </div>
    </div>
  );
}
