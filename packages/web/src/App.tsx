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

      {/* Mount only the active view so the hidden media grid does not preload in space mode. */}
      {view === "space" ? (
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          <EmbeddingSpace focusFileId={focusFileId} />
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
          <TaxonomyBrowser />
        </div>
      )}
    </div>
  );
}
