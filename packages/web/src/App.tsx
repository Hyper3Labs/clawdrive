import { useState, useEffect, useRef } from "react";
import { TopBar } from "./components/TopBar";
import { EmbeddingSpace } from "./components/space/EmbeddingSpace";
import { FilesBrowser } from "./components/files/FilesBrowser";
import { PotsSidebar } from "./components/files/PotsSidebar";
import { useVisualizationStore } from "./components/space/useVisualizationStore";
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
      <div className="flex flex-col h-screen overflow-hidden">
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
          <div className="flex-1 min-h-0 flex bg-[#0a0a0f]">
            <div className="w-72 shrink-0 border-r border-[#1f3647]/50 bg-[#061018]/50 flex flex-col overflow-y-auto">
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
          <div className="flex-1 min-h-0 flex overflow-hidden">
            <FilesBrowser refreshKey={refreshKey} />
          </div>
        )}
      </div>
    </ToastProvider>
  );
}
