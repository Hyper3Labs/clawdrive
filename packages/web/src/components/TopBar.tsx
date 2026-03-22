import { useEffect, useState } from "react";
import { ViewTabs } from "./ViewTabs";
import { listFiles } from "../api";

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
        borderBottom: "1px solid rgba(255,255,255,0.1)",
        background: "rgba(0,0,0,0.3)",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span style={{ fontWeight: "bold", fontSize: 15 }}>ClawDrive</span>
        <ViewTabs activeView={activeView} onViewChange={onViewChange} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <button
          onClick={onSearchOpen}
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 6,
            padding: "6px 14px",
            color: "rgba(255,255,255,0.5)",
            fontSize: 13,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
        >
          <span style={{ fontSize: 12, opacity: 0.6 }}>&#8984;K</span>
          <span>Search</span>
        </button>

        {fileCount !== null && (
          <span style={{ fontSize: 12, opacity: 0.4 }}>
            {fileCount.toLocaleString()} file{fileCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </header>
  );
}
