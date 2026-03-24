import { useState, useEffect, useRef } from "react";
import { TopBar } from "./components/TopBar";
import { EmbeddingSpace } from "./components/agent-view/EmbeddingSpace";
import { TaxonomyBrowser } from "./components/human-view/TaxonomyBrowser";
import type { ViewMode } from "./types";
import type { InlineSearchHandle } from "./components/InlineSearch";

export function App() {
  const [view, setView] = useState<ViewMode>("space");
  const [focusFileId, setFocusFileId] = useState<string | null>(null);
  const searchRef = useRef<InlineSearchHandle>(null);

  // Global Cmd+K / Ctrl+K shortcut — focus the inline search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
      <TopBar
        activeView={view}
        onViewChange={setView}
        onSelectResult={(result) => {
          setFocusFileId(result.id);
          setView("space");
          // Clear after camera animation settles so orbit controls are released
          setTimeout(() => setFocusFileId(null), 1500);
        }}
        searchRef={searchRef}
      />

      {/* Content — both views stay mounted, hidden via display */}
      <div style={{ flex: 1, minHeight: 0, display: view === "space" ? "flex" : "none" }}>
        <EmbeddingSpace focusFileId={focusFileId} />
      </div>
      <div style={{ flex: 1, minHeight: 0, display: view === "files" ? "flex" : "none", overflow: "hidden" }}>
        <TaxonomyBrowser />
      </div>
    </div>
  );
}
