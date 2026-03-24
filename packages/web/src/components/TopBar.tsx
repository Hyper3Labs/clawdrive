import { useEffect, useState } from "react";
import { ViewTabs } from "./ViewTabs";
import { InlineSearch, type InlineSearchHandle } from "./InlineSearch";
import { listFiles } from "../api";
import { MAP_THEME } from "../theme";
import type { ViewMode, SearchResult } from "../types";

interface TopBarProps {
  activeView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  onSelectResult: (result: SearchResult) => void;
  searchRef?: React.Ref<InlineSearchHandle>;
}

export function TopBar({ activeView, onViewChange, onSelectResult, searchRef }: TopBarProps) {
  const [fileCount, setFileCount] = useState<number | null>(null);
  const [searchActive, setSearchActive] = useState(false);

  useEffect(() => {
    listFiles({ limit: 1 })
      .then((res: { total?: number }) => {
        if (typeof res.total === "number") setFileCount(res.total);
      })
      .catch(() => {});
  }, []);

  const dimStyle = searchActive ? 0.4 : 1;

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        padding: "12px 20px",
        borderBottom: `1px solid ${MAP_THEME.border}`,
        background:
          "linear-gradient(180deg, rgba(8, 21, 31, 0.95) 0%, rgba(6, 16, 24, 0.95) 100%)",
        flexShrink: 0,
      }}
    >
      {/* Left: Logo */}
      <div style={{ flex: "0 0 auto", opacity: dimStyle, transition: "opacity 0.15s" }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: MAP_THEME.text }}>ClawDrive</span>
      </div>

      {/* Center: Search */}
      <div style={{ flex: 1, display: "flex", justifyContent: "center", padding: "0 30px" }}>
        <InlineSearch
          ref={searchRef}
          onSelectResult={onSelectResult}
          onActiveChange={setSearchActive}
        />
      </div>

      {/* Right: Tabs + Count */}
      <div
        style={{
          flex: "0 0 auto",
          display: "flex",
          alignItems: "center",
          gap: 12,
          opacity: dimStyle,
          transition: "opacity 0.15s",
        }}
      >
        <ViewTabs activeView={activeView} onViewChange={onViewChange} />
        {fileCount !== null && (
          <span style={{ fontSize: 12, opacity: 0.55, color: MAP_THEME.text }}>
            {fileCount.toLocaleString()} file{fileCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </header>
  );
}
