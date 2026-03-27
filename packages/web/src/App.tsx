import { useState, useEffect, useRef } from "react";
import { TopBar } from "./components/TopBar";
import { EmbeddingSpace } from "./components/agent-view/EmbeddingSpace";
import { FilesBrowser } from "./components/human-view/TaxonomyBrowser";
import { PotsSidebar } from "./components/human-view/PotsSidebar";
import { useVisualizationStore } from "./components/agent-view/useVisualizationStore";
import { ToastProvider } from "./components/shared/Toast";
import type { ViewMode } from "./types";
import type { InlineSearchHandle } from "./components/InlineSearch";

export function App() {
  const [view, setView] = useState<ViewMode>("space");
  const [focusFileId, setFocusFileId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const searchRef = useRef<InlineSearchHandle>(null);
  const selectPot = useVisualizationStore((s) => s.selectPot);
  const selectedPotId = useVisualizationStore((s) => s.selectedPotId);
  const pots = useVisualizationStore((s) => s.pots);

  const selectedPotSlug = selectedPotId
    ? (pots.find((p) => p.id === selectedPotId)?.slug ?? null)
    : null;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape" && selectedPotId) {
        selectPot(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPotId, selectPot]);

  return (
    <ToastProvider>
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
        <TopBar
          activeView={view}
          onViewChange={setView}
          onSelectResult={(result) => {
            setFocusFileId(result.id);
            setView("space");
            setTimeout(() => setFocusFileId(null), 1500);
          }}
          searchRef={searchRef}
          onUploadComplete={() => setRefreshKey((k) => k + 1)}
        />

        {view === "space" ? (
          <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
            <div
              style={{
                width: 240,
                flexShrink: 0,
                borderRight: "1px solid rgba(255,255,255,0.1)",
                display: "flex",
                flexDirection: "column",
                overflowY: "auto",
              }}
            >
              <PotsSidebar
                selectedSlug={selectedPotSlug}
                onSelectPot={(slug) => {
                  const pot = slug ? pots.find((p) => p.slug === slug) : null;
                  selectPot(pot?.id ?? null);
                }}
              />
            </div>
            <EmbeddingSpace focusFileId={focusFileId} />
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
            <FilesBrowser refreshKey={refreshKey} />
          </div>
        )}
      </div>
    </ToastProvider>
  );
}
