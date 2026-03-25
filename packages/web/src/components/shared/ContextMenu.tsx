import { useEffect, useRef } from "react";
import { MAP_THEME, Z_INDEX } from "../../theme";

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
      style={{
        position: "fixed",
        left: x,
        top: y,
        zIndex: Z_INDEX.contextMenu,
        background: MAP_THEME.panel,
        border: `1px solid ${MAP_THEME.border}`,
        borderRadius: 6,
        padding: "4px 0",
        minWidth: 140,
        boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
      }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => { item.onClick(); onClose(); }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = item.danger
              ? "rgba(255,100,100,0.15)"
              : "rgba(110,231,255,0.1)";
          }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          style={{
            display: "block",
            width: "100%",
            padding: "6px 12px",
            border: "none",
            background: "transparent",
            color: item.danger ? MAP_THEME.accentDanger : MAP_THEME.text,
            fontSize: 12,
            textAlign: "left",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
