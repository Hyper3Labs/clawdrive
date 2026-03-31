import { useState, useEffect } from "react";
import { FileGrid } from "./FileGrid";
import type { SortMode } from "./FileGrid";
import { FilePreview } from "./FilePreview";
import { DropZone } from "../shared/DropZone";
import { useUploadQueue } from "../../hooks/useUploadQueue";
import { PotsSidebar } from "./PotsSidebar";
import { cx } from "../shared/ui";

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
    <div className="flex flex-1 overflow-hidden min-h-0 w-full">
      {/* Sidebar — pots only */}
      <div className="w-72 shrink-0 border-r border-[var(--border)]/50 bg-[var(--bg)]/50 flex flex-col overflow-y-auto">
        <PotsSidebar
          selectedSlug={selectedPotSlug}
          onSelectPot={setSelectedPotSlug}
          onPotContentChanged={() => setRefreshKey((k) => k + 1)}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[var(--bg)]">
        <div className="flex items-center justify-between border-b border-[var(--border)]/50 px-5 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <span className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-2)] px-2 py-0.5 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
              Scope
            </span>
            <span className="truncate text-sm font-medium text-[var(--text)]">
              {selectedPotSlug ? `pot: ${selectedPotSlug}` : "All files"}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <span className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Sort</span>
            <div className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-panel)] p-0.5">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSort(opt.value)}
                  className={cx(
                    "rounded border-none px-2.5 py-1 text-xs font-medium transition-all duration-150",
                    sort === opt.value
                      ? "bg-[var(--accent-a20)] text-[var(--text)]"
                      : "bg-transparent text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-8 py-6">
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
