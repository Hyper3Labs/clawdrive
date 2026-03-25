import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from "react";
import type { ReactNode } from "react";
import { searchFiles } from "../api";
import type { SearchResult } from "../types";
import { MAP_THEME } from "../theme";
import { SearchFilters, EMPTY_FILTERS, type SearchFilterState } from "./shared/SearchFilters";
import { Search, FileText, Image, Video, Volume2, FileCode } from "lucide-react";

export interface InlineSearchHandle {
  focus: () => void;
}

interface InlineSearchProps {
  onSelectResult: (result: SearchResult) => void;
  onActiveChange?: (active: boolean) => void;
}

function contentTypeIcon(ct: string): ReactNode {
  if (ct.startsWith("application/pdf")) return <FileText size={14} />;
  if (ct.startsWith("image/")) return <Image size={14} />;
  if (ct.startsWith("video/")) return <Video size={14} />;
  if (ct.startsWith("audio/")) return <Volume2 size={14} />;
  return <FileCode size={14} />;
}

function scoreColor(score: number): string {
  if (score > 0.9) return MAP_THEME.accentSecondary;
  if (score > 0.7) return MAP_THEME.accentWarm;
  return "rgba(255,255,255,0.4)";
}

const kbdStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "1px 5px",
  margin: "0 3px",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 3,
  fontSize: 10,
  lineHeight: "16px",
};

export const InlineSearch = forwardRef<InlineSearchHandle, InlineSearchProps>(
  function InlineSearch({ onSelectResult, onActiveChange }, ref) {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [selectedIdx, setSelectedIdx] = useState(0);
    const [loading, setLoading] = useState(false);
    const [queryTime, setQueryTime] = useState<number | null>(null);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [filters, setFilters] = useState<SearchFilterState>(EMPTY_FILTERS);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const onActiveChangeRef = useRef(onActiveChange);
    const filtersRef = useRef<SearchFilterState>(EMPTY_FILTERS);

    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
    }));

    // Cancel debounce on unmount
    useEffect(() => {
      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }, []);

    useEffect(() => { onActiveChangeRef.current = onActiveChange; });
    useEffect(() => { filtersRef.current = filters; }, [filters]);

    // Close dropdown on outside click
    useEffect(() => {
      const handleMouseDown = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setDropdownOpen(false);
          setFocused(false);
          onActiveChangeRef.current?.(false);
        }
      };
      document.addEventListener("mousedown", handleMouseDown);
      return () => document.removeEventListener("mousedown", handleMouseDown);
    }, []);

    // Debounced search
    const doSearch = useCallback((q: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!q.trim()) {
        setResults([]);
        setQueryTime(null);
        setSelectedIdx(0);
        return;
      }
      debounceRef.current = setTimeout(async () => {
        setLoading(true);
        const start = performance.now();
        try {
          const currentFilters = filtersRef.current;
          const searchOpts = {
            type: currentFilters.types.length > 0 ? currentFilters.types.join(",") : undefined,
            pot: currentFilters.pot ?? undefined,
          };
          const res = await searchFiles(q, searchOpts);
          const elapsed = performance.now() - start;
          setResults(res.results ?? []);
          setQueryTime(elapsed);
          setSelectedIdx(0);
        } catch {
          setResults([]);
        } finally {
          setLoading(false);
        }
      }, 300);
    }, []);

    const handleInputChange = (val: string) => {
      setQuery(val);
      doSearch(val);
      if (!dropdownOpen) {
        setDropdownOpen(true);
        onActiveChangeRef.current?.(true);
      }
    };

    const handleFiltersChange = (newFilters: SearchFilterState) => {
      setFilters(newFilters);
      filtersRef.current = newFilters;
      if (query.trim()) {
        doSearch(query);
      }
    };

    const [focused, setFocused] = useState(false);

    const handleFocus = () => {
      setFocused(true);
      if (query.trim() || results.length > 0) {
        setDropdownOpen(true);
      }
      onActiveChangeRef.current?.(true);
    };

    const handleSelect = (result: SearchResult) => {
      onSelectResult(result);
      setDropdownOpen(false);
      setQuery("");
      setResults([]);
      onActiveChangeRef.current?.(false);
      inputRef.current?.blur();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results[selectedIdx]) {
        handleSelect(results[selectedIdx]);
      } else if (e.key === "Escape") {
        setDropdownOpen(false);
        onActiveChangeRef.current?.(false);
        inputRef.current?.blur();
      }
    };

    const showDropdown = dropdownOpen && (results.length > 0 || (query.trim() !== "" && !loading));

    return (
      <div ref={containerRef} style={{ position: "relative", width: "100%", maxWidth: 420 }}>
        {/* Search input */}
        <div
          style={{
            background: "rgba(14, 26, 36, 0.85)",
            border: `1px solid ${showDropdown || focused ? "rgba(110, 231, 255, 0.35)" : MAP_THEME.border}`,
            borderRadius: showDropdown ? "8px 8px 0 0" : 8,
            padding: "8px 16px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            transition: "border-color 0.15s",
          }}
        >
          <span style={{ opacity: 0.4, color: MAP_THEME.text, display: "flex", alignItems: "center" }}>
            <Search size={14} />
          </span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search files, pots, content..."
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: MAP_THEME.text,
              fontSize: 13,
              fontFamily: "inherit",
            }}
          />
          {loading && (
            <span style={{ fontSize: 12, opacity: 0.4, color: MAP_THEME.text }}>searching...</span>
          )}
          {!loading && !dropdownOpen && (
            <span style={{ fontSize: 11, opacity: 0.3, color: MAP_THEME.text }}>&#8984;K</span>
          )}
          {dropdownOpen && (
            <span style={{ fontSize: 11, opacity: 0.3, color: MAP_THEME.text }}>Esc</span>
          )}
        </div>

        {/* Results dropdown */}
        {showDropdown && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              zIndex: 1000,
              background: "rgba(10, 21, 32, 0.98)",
              border: `1px solid rgba(110, 231, 255, 0.2)`,
              borderTop: "none",
              borderRadius: "0 0 8px 8px",
              maxHeight: "60vh",
              overflowY: "auto",
              boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
            }}
          >
            {/* Filter row */}
            <div
              style={{
                padding: "6px 12px",
                borderBottom: "1px solid rgba(31, 54, 71, 0.4)",
              }}
            >
              <SearchFilters value={filters} onChange={handleFiltersChange} />
            </div>

            {results.length === 0 && query.trim() && !loading && (
              <div style={{ padding: "20px 16px", textAlign: "center", opacity: 0.4, fontSize: 13 }}>
                No results found
              </div>
            )}

            {results.map((r, idx) => (
              <div
                key={`${r.id}-${idx}`}
                style={{
                  padding: "10px 16px",
                  cursor: "pointer",
                  background: idx === selectedIdx ? "rgba(110, 231, 255, 0.06)" : "transparent",
                  borderBottom: idx < results.length - 1 ? "1px solid rgba(31, 54, 71, 0.4)" : "none",
                  transition: "background 0.1s",
                }}
                onMouseEnter={() => setSelectedIdx(idx)}
                onClick={() => handleSelect(r)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 14 }}>{contentTypeIcon(r.contentType)}</span>
                  <span style={{ fontSize: 13, color: MAP_THEME.text, fontWeight: 600 }}>
                    {r.file}
                  </span>
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 11,
                      fontWeight: 600,
                      color: scoreColor(r.score),
                      background: "rgba(110, 231, 255, 0.12)",
                      padding: "1px 6px",
                      borderRadius: 3,
                    }}
                  >
                    {r.score.toFixed(2)}
                  </span>
                </div>

                {r.taxonomyPath && r.taxonomyPath.length > 0 && (
                  <div style={{ fontSize: 11, color: "rgba(230, 240, 247, 0.4)", marginBottom: 5 }}>
                    {r.taxonomyPath.join(" \u203A ")}
                  </div>
                )}

                {(r.matchedChunk || r.tldr || r.description) && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "rgba(230, 240, 247, 0.55)",
                      background: "rgba(14, 26, 36, 0.6)",
                      padding: "5px 8px",
                      borderRadius: 4,
                      borderLeft: "2px solid rgba(110, 231, 255, 0.3)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.matchedChunk ? r.matchedChunk.label : (r.tldr ?? r.description)}
                  </div>
                )}
              </div>
            ))}

            {/* Footer */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 16px",
                borderTop: "1px solid rgba(31, 54, 71, 0.4)",
                background: "rgba(14, 26, 36, 0.5)",
                fontSize: 11,
                opacity: 0.4,
              }}
            >
              <span>
                <kbd style={kbdStyle}>{"\u2191"}</kbd>
                <kbd style={kbdStyle}>{"\u2193"}</kbd> navigate{" "}
                <kbd style={kbdStyle}>Enter</kbd> select{" "}
                <kbd style={kbdStyle}>Esc</kbd> close
              </span>
              <span>
                {results.length} result{results.length !== 1 ? "s" : ""}
                {queryTime !== null && ` \u00B7 ${queryTime.toFixed(0)}ms`}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }
);
