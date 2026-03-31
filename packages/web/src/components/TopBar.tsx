import { useEffect, useState, useRef } from "react";
import { ViewTabs } from "./ViewTabs";
import { InlineSearch, type InlineSearchHandle } from "./InlineSearch";
import { ShareInbox } from "./shared/ShareInbox";
import { listFiles, getConfig } from "../api";
import type { ViewMode, SearchResult } from "../types";
import { useUploadQueue } from "../hooks/useUploadQueue";
import { Upload } from "lucide-react";
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
      className="flex shrink-0 items-center justify-between gap-6 border-b border-[var(--border)] bg-[var(--bg)] px-5 py-2.5 shadow-sm"
    >
      {/* Left: Logo */}
      <div className={cx("min-w-0 transition-opacity duration-150 shrink-0", searchActive ? "opacity-[0.55]" : "opacity-100")}>
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="" width={26} height={26} className="shrink-0" />
          <div className="min-w-0 leading-none">
            <div className="font-bold text-xl text-white tracking-tight mb-[3px]">
              ClawDrive
              {isReadOnly && (
                <span className="text-xs text-[var(--text-muted)] ml-2">Demo</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="text-xs uppercase font-bold tracking-widest text-[var(--accent)]">Workspace</div>
              {fileCount !== null && (
                <div className="flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-[var(--border)]"></span>
                  <span className="text-xs font-semibold tracking-wider text-[var(--text-muted)]">
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
          "flex min-w-0 items-center justify-end gap-3 transition-opacity duration-150 shrink-0",
          searchActive ? "opacity-[0.55]" : "opacity-100",
        )}
      >
        <ViewTabs activeView={activeView} onViewChange={onViewChange} />
        <div className="w-px h-6 bg-[var(--border)]/80 mx-1"></div>
        <ShareInbox />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center justify-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-sm text-[var(--text)] transition-colors hover:bg-[var(--surface-3)]"
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
