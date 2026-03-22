type ViewMode = "agent" | "human";

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
    background: active ? "rgba(99,102,241,0.3)" : "transparent",
    color: "#e4e4e7",
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    transition: "background 0.15s",
  });

  return (
    <div
      style={{
        display: "flex",
        gap: 2,
        background: "rgba(255,255,255,0.05)",
        borderRadius: 6,
        padding: 2,
      }}
    >
      <button style={tabStyle(activeView === "agent")} onClick={() => onViewChange("agent")}>
        Agent View
      </button>
      <button style={tabStyle(activeView === "human")} onClick={() => onViewChange("human")}>
        Human View
      </button>
    </div>
  );
}
