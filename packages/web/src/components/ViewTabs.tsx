import { MAP_THEME } from "../theme";
import type { ViewMode } from "../types";

interface ViewTabsProps {
  activeView: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

export function ViewTabs({ activeView, onViewChange }: ViewTabsProps) {
  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "6px 16px",
    borderRadius: 5,
    border: "none",
    cursor: "pointer",
    background: active ? "rgba(110, 231, 255, 0.22)" : "transparent",
    color: MAP_THEME.text,
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    transition: "background 0.15s",
  });

  return (
    <div
      style={{
        display: "flex",
        gap: 2,
        background: "rgba(14, 26, 36, 0.8)",
        border: `1px solid ${MAP_THEME.border}`,
        borderRadius: 6,
        padding: 2,
      }}
    >
      <button style={tabStyle(activeView === "space")} onClick={() => onViewChange("space")}>
        Space
      </button>
      <button style={tabStyle(activeView === "files")} onClick={() => onViewChange("files")}>
        Files
      </button>
    </div>
  );
}
