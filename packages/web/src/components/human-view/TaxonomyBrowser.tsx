import { useState } from "react";
import { TaxonomySidebar } from "./TaxonomySidebar";
import { FileGrid } from "./FileGrid";
import type { SortMode } from "./FileGrid";
import { Breadcrumb } from "./Breadcrumb";
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

interface TaxonomyBrowserProps {
  refreshKey?: number;
}

export function TaxonomyBrowser({ refreshKey: externalRefreshKey = 0 }: TaxonomyBrowserProps) {
  const [selectedPath, setSelectedPath] = useState<string[]>([]);
  const [selectedPotSlug, setSelectedPotSlug] = useState<string | null>(null);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>("recent");
  const [refreshKey, setRefreshKey] = useState(0);
  const { enqueue } = useUploadQueue({ onComplete: () => setRefreshKey(k => k + 1) });
  function handleSelectPot(slug: string | null) {
    setSelectedPotSlug(slug);
    setSelectedPath([]);
  }

  function handleSelectPath(path: string[]) {
    setSelectedPath(path);
    setSelectedPotSlug(null);
  }

  return (
    <DropZone onDrop={enqueue}>
    <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
      {/* Sidebar */}
      <div
        style={{
          width: 240,
          flexShrink: 0,
          borderRight: "1px solid rgba(255,255,255,0.1)",
          display: "flex",
          flexDirection: "column",
          overflowY: "hidden",
        }}
      >
        <PotsSidebar selectedSlug={selectedPotSlug} onSelectPot={handleSelectPot} onPotContentChanged={() => setRefreshKey((k) => k + 1)} />
        <div style={{ flex: 1, overflowY: "auto", borderTop: "1px solid rgba(255,255,255,0.07)" }}>
          <TaxonomySidebar selectedPath={selectedPath} onSelect={handleSelectPath} />
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{
          padding: "10px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <Breadcrumb path={selectedPotSlug ? [`pot: ${selectedPotSlug}`] : selectedPath} onNavigate={handleSelectPath} />
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
                    color: sort === opt.value ? "#e4e4e7" : "rgba(255,255,255,0.4)",
                    background: sort === opt.value ? "rgba(99,102,241,0.25)" : "transparent",
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
          <FileGrid key={`${refreshKey}-${externalRefreshKey}`} selectedPath={selectedPath} potSlug={selectedPotSlug ?? undefined} onFileClick={setPreviewFileId} sort={sort} />
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
