import { useState, useEffect, useRef } from "react";
import { searchFiles } from "../../api";
import { Z_INDEX } from "../../theme";
import type { SearchResult } from "../../types";
import { cx, ui } from "./ui";

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
      style={{ left: anchorX, top: anchorY, zIndex: Z_INDEX.contextMenu }}
      className={cx(ui.popover, "fixed w-[280px] p-2")}
    >
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search files to add..."
        className={cx(ui.input, "box-border px-2 py-1.5")}
      />
      <div className="max-h-[240px] overflow-y-auto mt-1">
        {results.map((r) => {
          const inPot = excludeIds?.has(r.id);
          return (
            <button
              key={r.id}
              onClick={() => !inPot && onSelect(r.id)}
              className={`flex w-full items-center gap-2 rounded border-none bg-transparent px-2 py-1.5 text-left text-xs transition-colors ${inPot ? 'cursor-default text-[var(--text-muted)] opacity-50' : 'cursor-pointer text-[var(--text)] opacity-100 hover:bg-[var(--surface-2)]'}`}
            >
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                {r.file || r.id}
              </span>
              {inPot && <span className="text-[10px]">✓</span>}
            </button>
          );
        })}
        {query && results.length === 0 && (
          <div className="p-2 text-[11px] opacity-40 text-center">No results</div>
        )}
      </div>
    </div>
  );
}
