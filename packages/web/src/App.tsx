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
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
      if (e.key === "Escape") {
        if (sidebarOpen) setSidebarOpen(false);
        if (selectedPotId) selectPot(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPotId, selectPot, sidebarOpen]);

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
          onToggleSidebar={() => setSidebarOpen((o) => !o)}
        />

        {view === "space" ? (
          <div className="flex-1 min-h-0 flex bg-[var(--bg)]">
            {/* Desktop sidebar */}
            <div className="hidden md:flex w-72 shrink-0 border-r border-[var(--border-subtle)] flex-col overflow-y-auto">
              <PotsSidebar
                selectedSlug={selectedPotSlug}
                onSelectPot={(slug) => {
                  const pot = slug ? pots.find((p) => p.slug === slug) : null;
                  selectPot(pot?.id ?? null);
                }}
              />
            </div>
            {/* Mobile sidebar overlay */}
            {sidebarOpen && (
              <div className="fixed inset-0 z-overlay md:hidden" onClick={() => setSidebarOpen(false)}>
                <div className="absolute left-0 top-0 h-full w-72 bg-[var(--bg-panel)] border-r border-[var(--border-subtle)] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                  <PotsSidebar
                    selectedSlug={selectedPotSlug}
                    onSelectPot={(slug) => {
                      const pot = slug ? pots.find((p) => p.slug === slug) : null;
                      selectPot(pot?.id ?? null);
                      setSidebarOpen(false);
                    }}
                  />
                </div>
              </div>
            )}
            <EmbeddingSpace focusFileId={focusFileId} />
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex overflow-hidden">
            <FilesBrowser refreshKey={refreshKey} sidebarOpen={sidebarOpen} onCloseSidebar={() => setSidebarOpen(false)} />
          </div>
        )}
      </div>
    </ToastProvider>
  );
}
