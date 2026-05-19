import { PanelLeft, PanelLeftClose } from "lucide-react";
import { useAppStore } from "../store/appStore";

/**
 * Custom title bar for the `Overlay` window style — content sits under the
 * traffic lights, and the whole bar is a drag region.
 */
export function TitleBar() {
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);

  return (
    <header className="titlebar" data-tauri-drag-region>
      <button
        className="icon-btn titlebar-toggle"
        onClick={toggleSidebar}
        title="Toggle sidebar"
      >
        {collapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
      </button>
      <span className="wordmark" data-tauri-drag-region>
        Maple
      </span>
    </header>
  );
}
