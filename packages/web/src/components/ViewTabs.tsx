import type { ViewMode } from "../types";
import { cx } from "./shared/ui";

interface ViewTabsProps {
  activeView: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

export function ViewTabs({ activeView, onViewChange }: ViewTabsProps) {
  const getTabClass = (active: boolean) =>
    cx(
      "rounded-lg px-5 h-full flex items-center justify-center text-[13px] font-bold leading-none transition-all duration-200",
      active
        ? "bg-[var(--accent)]/20 text-[var(--accent)] shadow-sm transform scale-105"
        : "bg-transparent text-[var(--text-muted)] hover:bg-[var(--surface-3)] hover:text-white"
    );

  return (
    <div className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)]/50 bg-[var(--bg-panel)] p-1 shadow-inner h-[40px]">
      <button className={getTabClass(activeView === "space")} onClick={() => onViewChange("space")}>
        Space
      </button>
      <button className={getTabClass(activeView === "files")} onClick={() => onViewChange("files")}>
        Files
      </button>
    </div>
  );
}
