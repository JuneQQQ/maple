import { MessageSquare, Plus, Settings, Trash2 } from "lucide-react";
import clsx from "clsx";
import { useAppStore } from "../store/appStore";
import { relativeTime } from "../lib/format";

export function Sidebar() {
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const conversations = useAppStore((s) => s.conversations);
  const currentId = useAppStore((s) => s.currentId);
  const view = useAppStore((s) => s.view);
  const newConversation = useAppStore((s) => s.newConversation);
  const selectConversation = useAppStore((s) => s.selectConversation);
  const deleteConversation = useAppStore((s) => s.deleteConversation);
  const setView = useAppStore((s) => s.setView);

  if (collapsed) return null;

  return (
    <aside className="sidebar">
      <button className="new-chat-btn" onClick={newConversation}>
        <Plus size={16} />
        <span>New session</span>
      </button>

      <nav className="conv-list">
        {conversations.length === 0 && (
          <p className="empty-hint">No conversations yet.</p>
        )}
        {conversations.map((c) => (
          <div
            key={c.id}
            className={clsx(
              "conv-item",
              currentId === c.id && view === "chat" && "active",
            )}
            onClick={() => void selectConversation(c.id)}
          >
            <MessageSquare size={15} className="conv-icon" />
            <div className="conv-text">
              <span className="conv-title">{c.title}</span>
              <span className="conv-time">{relativeTime(c.updated_at)}</span>
            </div>
            <button
              className="conv-del"
              title="Delete conversation"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`Delete "${c.title}"?`)) {
                  void deleteConversation(c.id);
                }
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </nav>

      <button
        className={clsx("sidebar-foot", view === "settings" && "active")}
        onClick={() => setView("settings")}
      >
        <Settings size={16} />
        <span>Settings</span>
      </button>
    </aside>
  );
}
