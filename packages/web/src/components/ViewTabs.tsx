import type { ViewMode } from "../types";
import { cx } from "./shared/ui";

interface ViewTabsProps {
  activeView: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

export function ViewTabs({ activeView, onViewChange }: ViewTabsProps) {
  const getTabClass = (active: boolean) =>
    cx(
      "rounded-lg px-5 py-2.5 text-[13px] font-bold leading-none transition-all duration-200",
      active
        ? "bg-[#6ee7ff]/20 text-[#6ee7ff] shadow-sm transform scale-105"
        : "bg-transparent text-[#6b8a9e] hover:bg-white/10 hover:text-white"
    );

  return (
    <div className="inline-flex items-center gap-2 rounded-xl border border-[#1f3647]/50 bg-[#0e1a24] p-1.5 shadow-inner">
      <button className={getTabClass(activeView === "space")} onClick={() => onViewChange("space")}>
        Space
      </button>
      <button className={getTabClass(activeView === "files")} onClick={() => onViewChange("files")}>
        Files
      </button>
    </div>
  );
}
