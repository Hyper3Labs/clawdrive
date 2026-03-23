import { useEffect, useState } from "react";
import { ViewTabs } from "./ViewTabs";
import { listFiles } from "../api";
import { MAP_THEME } from "../theme";

type ViewMode = "agent" | "human";

interface TopBarProps {
  activeView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  onSearchOpen: () => void;
}

export function TopBar({ activeView, onViewChange, onSearchOpen }: TopBarProps) {
  const [fileCount, setFileCount] = useState<number | null>(null);

  useEffect(() => {
    listFiles({ limit: 1 })
      .then((res: { total?: number }) => {
        if (typeof res.total === "number") setFileCount(res.total);
      })
      .catch(() => {});
  }, []);

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 20px",
        borderBottom: `1px solid ${MAP_THEME.border}`,
        background:
          "linear-gradient(180deg, rgba(8, 21, 31, 0.95) 0%, rgba(6, 16, 24, 0.95) 100%)",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: MAP_THEME.text }}>ClawDrive</span>
        <ViewTabs activeView={activeView} onViewChange={onViewChange} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <button
          onClick={onSearchOpen}
          style={{
            background: "rgba(14, 26, 36, 0.85)",
            border: `1px solid ${MAP_THEME.border}`,
            borderRadius: 6,
            padding: "6px 14px",
            color: "rgba(230, 240, 247, 0.72)",
            fontSize: 13,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(20, 40, 54, 0.92)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(14, 26, 36, 0.85)")}
        >
          <span style={{ fontSize: 12, opacity: 0.6 }}>&#8984;K</span>
          <span>Search</span>
        </button>

        {fileCount !== null && (
          <span style={{ fontSize: 12, opacity: 0.55, color: MAP_THEME.text }}>
            {fileCount.toLocaleString()} file{fileCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </header>
  );
}
