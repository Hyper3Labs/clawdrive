import { useState, useEffect, useRef } from "react";
import { searchFiles } from "../../api";
import { MAP_THEME, Z_INDEX } from "../../theme";
import type { SearchResult } from "../../types";

interface FileSearchPickerProps {
  onSelect: (fileId: string) => void;
  excludeIds?: Set<string>;
  onClose: () => void;
  anchorX: number;
  anchorY: number;
}

export function FileSearchPicker({ onSelect, excludeIds, onClose, anchorX, anchorY }: FileSearchPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timeout = window.setTimeout(async () => {
      try {
        const res = await searchFiles(query);
        setResults(res.results ?? []);
      } catch { setResults([]); }
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: anchorX,
        top: anchorY,
        width: 280,
        zIndex: Z_INDEX.contextMenu,
        background: MAP_THEME.panel,
        border: `1px solid ${MAP_THEME.border}`,
        borderRadius: 8,
        padding: 8,
        boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
      }}
    >
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search files to add..."
        style={{
          width: "100%",
          background: "rgba(255,255,255,0.05)",
          border: `1px solid ${MAP_THEME.border}`,
          borderRadius: 4,
          color: MAP_THEME.text,
          fontSize: 12,
          padding: "6px 8px",
          outline: "none",
          fontFamily: "inherit",
          boxSizing: "border-box",
        }}
      />
      <div style={{ maxHeight: 240, overflowY: "auto", marginTop: 4 }}>
        {results.map((r) => {
          const inPot = excludeIds?.has(r.id);
          return (
            <button
              key={r.id}
              onClick={() => !inPot && onSelect(r.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "6px 8px",
                border: "none",
                background: "transparent",
                color: inPot ? MAP_THEME.textMuted : MAP_THEME.text,
                fontSize: 12,
                cursor: inPot ? "default" : "pointer",
                textAlign: "left",
                opacity: inPot ? 0.5 : 1,
                fontFamily: "inherit",
                borderRadius: 4,
              }}
              onMouseEnter={(e) => { if (!inPot) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.file || r.id}
              </span>
              {inPot && <span style={{ fontSize: 10 }}>✓</span>}
            </button>
          );
        })}
        {query && results.length === 0 && (
          <div style={{ padding: 8, fontSize: 11, opacity: 0.4, textAlign: "center" }}>No results</div>
        )}
      </div>
    </div>
  );
}
