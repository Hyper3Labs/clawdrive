import { useEffect, useState, useRef } from "react";
import { ViewTabs } from "./ViewTabs";
import { InlineSearch, type InlineSearchHandle } from "./InlineSearch";
import { ShareInbox } from "./shared/ShareInbox";
import { listFiles, getConfig } from "../api";
import type { ViewMode, SearchResult } from "../types";
import { useUploadQueue } from "../hooks/useUploadQueue";
import { Upload, AlertTriangle } from "lucide-react";
import { cx, ui } from "./shared/ui";

interface TopBarProps {
  activeView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  onSelectResult: (result: SearchResult) => void;
  searchRef?: React.Ref<InlineSearchHandle>;
  onUploadComplete?: () => void;
}

export function TopBar({ activeView, onViewChange, onSelectResult, searchRef, onUploadComplete }: TopBarProps) {
  const [fileCount, setFileCount] = useState<number | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [searchActive, setSearchActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { enqueue } = useUploadQueue({ onComplete: onUploadComplete });

  useEffect(() => {
    getConfig().then((config) => {
      if (config?.readOnly) setIsReadOnly(true);
    }).catch(() => {});

    listFiles({ limit: 1 })
      .then((res: { total?: number }) => {
        if (typeof res.total === "number") setFileCount(res.total);
      })
      .catch(() => {});
  }, []);

  return (
    <header
      className="flex shrink-0 items-center justify-between gap-6 border-b border-[var(--border)] bg-[var(--bg)] px-8 py-5 shadow-sm"
    >
      {/* Left: Logo */}
      <div className={cx("min-w-0 transition-opacity duration-150 flex-shrink-0 w-[240px]", searchActive ? "opacity-[0.55]" : "opacity-100")}>
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="" width={26} height={26} className="shrink-0" />
          <div className="min-w-0 leading-none">
            <div className="font-bold text-[16px] text-white tracking-tight mb-[3px]">
              ClawDrive
              {isReadOnly && (
                <span className="ml-3 inline-flex items-center gap-1 rounded bg-[#ff3366]/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[#ff3366] border border-[#ff3366]/20 align-middle -translate-y-[1px]">
                  <AlertTriangle size={10} strokeWidth={3} />
                  Read-Only Demo
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="text-[10px] uppercase font-bold tracking-[0.15em] text-[var(--accent)]">Workspace</div>
              {fileCount !== null && (
                <div className="flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-[var(--border)]"></span>
                  <span className="text-[10px] font-semibold tracking-wider text-[var(--text-muted)]">
                    {fileCount.toLocaleString()} {fileCount === 1 ? "file" : "files"}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Center: Search */}
      <div className="flex-1 max-w-[500px] min-w-0">
        <InlineSearch
          ref={searchRef}
          onSelectResult={onSelectResult}
          onActiveChange={setSearchActive}
        />
      </div>

      {/* Right: Tabs + Count */}
      <div
        className={cx(
          "flex min-w-0 items-center justify-end gap-3 transition-opacity duration-150 flex-shrink-0 w-[420px]",
          searchActive ? "opacity-[0.55]" : "opacity-100",
        )}
      >
        <ViewTabs activeView={activeView} onViewChange={onViewChange} />
        <div className="w-px h-6 bg-[var(--border)]/80 mx-1"></div>
        <ShareInbox />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="group relative inline-flex items-center justify-center gap-2 px-4 h-[40px] text-[13px] rounded-xl font-bold border border-[var(--border)]/50 bg-[var(--bg-panel)] text-[var(--text)] hover:bg-[var(--surface-2)] hover:border-[var(--accent)]/30 hover:text-white shadow-inner transition-all"
          title="Upload files"
        >
          <Upload size={16} className="text-[var(--accent)] group-hover:text-[var(--accent)]"/> Upload
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0) enqueue(files);
            e.target.value = "";
          }}
        />
      </div>
    </header>
  );
}
