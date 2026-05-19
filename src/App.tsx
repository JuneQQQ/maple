import { useEffect } from "react";
import { useAppStore } from "./store/appStore";
import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { ChatView } from "./components/ChatView";
import { SettingsView } from "./components/SettingsView";

export default function App() {
  const ready = useAppStore((s) => s.ready);
  const view = useAppStore((s) => s.view);
  const init = useAppStore((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className="app">
      <TitleBar />
      <div className="app-body">
        <Sidebar />
        <main className="app-main">
          {!ready ? (
            <div className="app-loading">Loading…</div>
          ) : view === "settings" ? (
            <SettingsView />
          ) : (
            <ChatView />
          )}
        </main>
      </div>
    </div>
  );
}
