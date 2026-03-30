import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from "react";
import type { ReactNode } from "react";
import { searchFiles } from "../api";
import type { SearchResult } from "../types";
import { SearchFilters, EMPTY_FILTERS, type SearchFilterState } from "./shared/SearchFilters";
import { Search, FileText, Image, Video, Volume2, FileCode } from "lucide-react";
import { cx } from "./shared/ui";

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
  if (score > 0.9) return "var(--accent-green)";
  if (score > 0.7) return "var(--accent-warm)";
  return "rgba(255,255,255,0.4)";
}

const kbdClassName =
  "mx-[3px] inline-block rounded border border-[var(--border-subtle)] px-[5px] py-px text-[10px] leading-4";

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
      <div ref={containerRef} className="relative w-full max-w-[560px] xl:max-w-[620px] mx-auto">
        {/* Search input */}
        <div
          className={cx(
            "flex items-center gap-3 border bg-[var(--bg-panel)] px-5 py-3 transition-all duration-200",
            showDropdown ? "rounded-t-2xl border-b-transparent shadow-xl" : "rounded-2xl",
            showDropdown || focused ? "border-[var(--accent)]/40 ring-1 ring-[var(--accent)]/10" : "border-[var(--border)]/50 shadow-inner",
          )}
        >
          <span className={cx("flex items-center transition-colors", focused ? "text-[var(--accent)]" : "text-[var(--text-muted)]")}>
            <Search size={16} />
          </span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search files, pots, content..."
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            className="min-w-0 flex-1 border-none bg-transparent text-[15px] font-medium text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]/60"
          />
          {loading && (
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--accent)]/80">searching...</span>
          )}
          {!loading && !dropdownOpen && (
            <span className="text-[11px] font-semibold tracking-wider text-[var(--text-muted)] border border-[var(--border-strong)] px-2 py-0.5 rounded bg-[var(--surface-2)]">&#8984;K</span>
          )}
          {dropdownOpen && (
            <span className="text-[11px] font-semibold tracking-wider text-[var(--text-muted)] border border-[var(--border-strong)] px-2 py-0.5 rounded bg-[var(--surface-2)]">Esc</span>
          )}
        </div>

        {/* Results dropdown */}
        {showDropdown && (
          <div className="absolute top-full left-0 right-0 z-[1000] max-h-[68vh] overflow-y-auto rounded-b-xl border border-[var(--accent-a20)] border-t-transparent bg-[var(--bg-panel)]/98 shadow-[0_22px_54px_rgba(0,0,0,0.48)] backdrop-blur">
            {/* Filter row */}
            <div className="border-b border-[var(--border)]/45 px-4 py-2.5">
              <SearchFilters value={filters} onChange={handleFiltersChange} />
            </div>

            {results.length === 0 && query.trim() && !loading && (
              <div className="px-4 py-6 text-center text-[13px] text-[var(--text-muted)]">
                No results found
              </div>
            )}

            {results.map((r, idx) => (
              <div
                key={`${r.id}-${idx}`}
                className={`cursor-pointer px-4 py-3 transition-colors duration-100 ${
                  idx === selectedIdx ? "bg-[var(--accent-a10)]" : "bg-transparent"
                } ${
                  idx < results.length - 1 ? "border-b border-[var(--border)]/40" : "border-none"
                }`}
                onMouseEnter={() => setSelectedIdx(idx)}
                onClick={() => handleSelect(r)}
              >
                <div className="mb-1.5 flex items-center gap-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--surface-2)] text-[var(--text-muted)]">
                    {contentTypeIcon(r.contentType)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-5 text-[var(--text)]">
                    {r.file}
                  </span>
                  <span
                    className="ml-2 shrink-0 rounded-[4px] bg-[var(--accent-a10)] px-1.5 py-[2px] text-[10px] font-semibold"
                    style={{ color: scoreColor(r.score) }}
                  >
                    {r.score.toFixed(2)}
                  </span>
                </div>

                {r.taxonomyPath && r.taxonomyPath.length > 0 && (
                  <div className="mb-1.5 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-[var(--text-faint)]">
                    {r.taxonomyPath.join(" \u203A ")}
                  </div>
                )}

                {(r.matchedChunk || r.tldr || r.description) && (
                  <div className="max-h-[3.35em] overflow-hidden rounded-md border-l-2 border-[var(--accent-a35)] bg-[var(--bg-panel)]/60 px-2.5 py-2 text-[12px] leading-[1.4] text-[var(--text)]/58 whitespace-normal">
                    {r.matchedChunk ? r.matchedChunk.label : (r.tldr ?? r.description)}
                  </div>
                )}
              </div>
            ))}

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-[var(--border)]/40 bg-[var(--bg-panel)]/50 px-4 py-2 text-[11px] text-[var(--text-faint)]">
              <span>
                <kbd className={kbdClassName}>{"\u2191"}</kbd>
                <kbd className={kbdClassName}>{"\u2193"}</kbd> navigate{" "}
                <kbd className={kbdClassName}>Enter</kbd> select{" "}
                <kbd className={kbdClassName}>Esc</kbd> close
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
