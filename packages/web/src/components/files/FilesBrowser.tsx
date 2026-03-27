import { useState, useEffect } from "react";
import { MAP_THEME } from "../../theme";
import { FileGrid } from "./FileGrid";
import type { SortMode } from "./FileGrid";
import { FilePreview } from "./FilePreview";
import { DropZone } from "../shared/DropZone";
import { useUploadQueue } from "../../hooks/useUploadQueue";
import { PotsSidebar } from "./PotsSidebar";

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "recent", label: "Recent" },
  { value: "name", label: "Name" },
  { value: "type", label: "Type" },
  { value: "size", label: "Size" },
];

interface FilesBrowserProps {
  refreshKey?: number;
}

export function FilesBrowser({ refreshKey: externalRefreshKey = 0 }: FilesBrowserProps) {
  const [selectedPotSlug, setSelectedPotSlug] = useState<string | null>(null);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>("recent");
  const [refreshKey, setRefreshKey] = useState(0);
  const { enqueue } = useUploadQueue({ onComplete: () => setRefreshKey(k => k + 1) });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedPotSlug) {
        setSelectedPotSlug(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPotSlug]);

  return (
    <DropZone onDrop={enqueue}>
    <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
      {/* Sidebar — pots only */}
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
          onSelectPot={setSelectedPotSlug}
          onPotContentChanged={() => setRefreshKey((k) => k + 1)}
        />
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{
          padding: "10px 20px",
          borderBottom: `1px solid ${MAP_THEME.borderSubtle}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: MAP_THEME.text }}>
            {selectedPotSlug ? `pot: ${selectedPotSlug}` : "All"}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 11, opacity: 0.35 }}>Sort:</span>
            <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.04)", borderRadius: 5, padding: 2 }}>
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSort(opt.value)}
                  style={{
                    padding: "4px 10px",
                    borderRadius: 4,
                    border: "none",
                    cursor: "pointer",
                    fontSize: 11,
                    color: sort === opt.value ? MAP_THEME.text : "rgba(255,255,255,0.4)",
                    background: sort === opt.value ? "rgba(110,231,255,0.22)" : "transparent",
                    transition: "all 0.15s",
                    fontFamily: "inherit",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          <FileGrid
            key={`${refreshKey}-${externalRefreshKey}`}
            potSlug={selectedPotSlug ?? undefined}
            onFileClick={setPreviewFileId}
            sort={sort}
          />
        </div>
      </div>

      {/* File preview panel */}
      {previewFileId && (
        <FilePreview fileId={previewFileId} onClose={() => setPreviewFileId(null)} />
      )}
    </div>
    </DropZone>
  );
}
