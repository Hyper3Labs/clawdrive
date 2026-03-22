import { useState, useEffect } from "react";
import { TopBar } from "./components/TopBar";
import { EmbeddingSpace } from "./components/agent-view/EmbeddingSpace";
import { TaxonomyBrowser } from "./components/human-view/TaxonomyBrowser";
import { SpotlightSearch } from "./components/SpotlightSearch";

type ViewMode = "agent" | "human";

export function App() {
  const [view, setView] = useState<ViewMode>("agent");
  const [spotlightOpen, setSpotlightOpen] = useState(false);

  // Global Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSpotlightOpen((prev) => !prev);
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
        onSearchOpen={() => setSpotlightOpen(true)}
      />

      {/* Content */}
      {view === "agent" ? (
        <EmbeddingSpace />
      ) : (
        <TaxonomyBrowser />
      )}

      {/* Spotlight Search overlay */}
      <SpotlightSearch open={spotlightOpen} onClose={() => setSpotlightOpen(false)} />
    </div>
  );
}
