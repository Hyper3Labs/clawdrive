import type { ViewMode } from "../types";
import { cx } from "./shared/ui";

interface ViewTabsProps {
  activeView: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

export function ViewTabs({ activeView, onViewChange }: ViewTabsProps) {
  const getTabClass = (active: boolean) =>
    cx(
      "rounded px-3 py-1.5 flex items-center justify-center text-sm font-medium leading-none transition-all duration-200",
      active
        ? "bg-[var(--accent-a20)] text-[var(--accent)]"
        : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]"
    );

  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)]/50 bg-[var(--bg-panel)] p-1">
      <button className={getTabClass(activeView === "space")} onClick={() => onViewChange("space")}>
        Space
      </button>
      <button className={getTabClass(activeView === "files")} onClick={() => onViewChange("files")}>
        Files
      </button>
    </div>
  );
}
