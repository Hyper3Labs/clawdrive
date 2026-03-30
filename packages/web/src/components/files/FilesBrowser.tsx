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
      <div className="w-72 shrink-0 border-r border-[#1f3647]/50 bg-[#061018]/50 flex flex-col overflow-y-auto">
        <PotsSidebar
          selectedSlug={selectedPotSlug}
          onSelectPot={setSelectedPotSlug}
          onPotContentChanged={() => setRefreshKey((k) => k + 1)}
        />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#0a0a0f]">
        <div className="flex items-center justify-between border-b border-[#1f3647]/50 px-8 py-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-[#6b8a9e]">
              Scope
            </span>
            <span className="truncate text-lg font-bold text-[#e6f0f7]">
              {selectedPotSlug ? `pot: ${selectedPotSlug}` : "All files"}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-[#6b8a9e]">Sort</span>
            <div className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#0e1a24] p-1.5">
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSort(opt.value)}
                  className={cx(
                    "rounded-lg border-none px-4 py-2 text-[13px] font-semibold transition-all duration-150",
                    sort === opt.value
                      ? "bg-[#6ee7ff]/20 text-[#e6f0f7] shadow-sm transform scale-105"
                      : "bg-transparent text-[#6b8a9e] hover:bg-white/10 hover:text-white",
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
