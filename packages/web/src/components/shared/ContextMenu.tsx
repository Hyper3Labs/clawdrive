import { useEffect, useRef } from "react";
import { cx, ui } from "./ui";

export interface ContextMenuItem {
  label: string;
  danger?: boolean;
  onClick: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{ left: x, top: y }}
      className={cx(ui.popover, "z-context-menu fixed min-w-[140px] py-1")}
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => { item.onClick(); onClose(); }}
          className={cx(
            "block w-full border-none bg-transparent px-3 py-1.5 text-left text-xs transition-colors",
            item.danger
              ? "text-[var(--accent-danger)] hover:bg-[var(--accent-danger)]/15"
              : "text-[var(--text)] hover:bg-[var(--accent-a10)]",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
