import { useEffect, useState, useRef } from "react";
import { ViewTabs } from "./ViewTabs";
import { InlineSearch, type InlineSearchHandle } from "./InlineSearch";
import { ShareInbox } from "./shared/ShareInbox";
import { listFiles } from "../api";
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
  const [searchActive, setSearchActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { enqueue } = useUploadQueue({ onComplete: onUploadComplete });

  useEffect(() => {
    listFiles({ limit: 1 })
      .then((res: { total?: number }) => {
        if (typeof res.total === "number") setFileCount(res.total);
      })
      .catch(() => {});
  }, []);

  return (
    <header
      className="flex shrink-0 items-center justify-between gap-6 border-b border-[var(--border)] bg-[#0a0a0f] px-8 py-5 shadow-sm"
    >
      {/* Left: Logo */}
      <div className={cx("min-w-0 transition-opacity duration-150 flex-shrink-0 w-[240px]", searchActive ? "opacity-[0.55]" : "opacity-100")}>
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="" width={26} height={26} className="shrink-0" />
          <div className="min-w-0 leading-none">
            <div className="font-bold text-[16px] text-[var(--text)] tracking-tight">ClawDrive</div>
            <div className="mt-1.5 text-[10px] uppercase font-medium tracking-[0.15em] text-[var(--textMuted)]">Workspace</div>
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
          "flex min-w-0 items-center justify-end gap-4 transition-opacity duration-150 flex-shrink-0 w-[380px]",
          searchActive ? "opacity-[0.55]" : "opacity-100",
        )}
      >
        <ViewTabs activeView={activeView} onViewChange={onViewChange} />
        <ShareInbox />
        <button
          onClick={() => fileInputRef.current?.click()}
          className={cx(ui.subtleButton, "gap-2 px-3.5 py-2 text-[12px]")}
          title="Upload files"
        >
          <Upload size={14} /> Upload
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
        {fileCount !== null && (
          <span className="rounded-full border border-white/8 bg-white/[0.04] px-2.5 py-1 text-[11px] text-[var(--textMuted)]">
            {fileCount.toLocaleString()} file{fileCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </header>
  );
}
