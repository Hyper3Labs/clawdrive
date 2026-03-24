import { useState, useEffect, useRef, useCallback } from "react";
import { searchFiles } from "../api";
import type { SearchResult } from "../types";
import { MAP_THEME } from "../theme";

interface SpotlightSearchProps {
  open: boolean;
  onClose: () => void;
  onSelectResult: (result: SearchResult) => void;
}

function contentTypeIcon(ct: string): string {
  if (ct.startsWith("application/pdf")) return "\uD83D\uDCC4";
  if (ct.startsWith("image/")) return "\uD83D\uDDBC\uFE0F";
  if (ct.startsWith("video/")) return "\uD83C\uDFAC";
  if (ct.startsWith("audio/")) return "\uD83D\uDD0A";
  return "\uD83D\uDCDD";
}

function scoreColor(score: number): string {
  if (score > 0.9) return "#86efac";
  if (score > 0.7) return "#fbbf24";
  return "rgba(255,255,255,0.4)";
}

export function SpotlightSearch({ open, onClose, onSelectResult }: SpotlightSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [queryTime, setQueryTime] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelectedIdx(0);
      setQueryTime(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Debounced search
  const doSearch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) {
      setResults([]);
      setQueryTime(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const start = performance.now();
      try {
        const res = await searchFiles(q);
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
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIdx]) {
      onSelectResult(results[selectedIdx]);
      onClose();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "15vh",
        background: "rgba(3, 10, 15, 0.68)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 560,
          maxHeight: "60vh",
          background: "#0e1a24",
          border: `1px solid ${MAP_THEME.border}`,
          borderRadius: 12,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 16px",
            borderBottom: `1px solid ${MAP_THEME.border}`,
          }}
        >
          <span style={{ fontSize: 16, opacity: 0.4 }}>{"\uD83D\uDD0D"}</span>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search files..."
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: MAP_THEME.text,
              fontSize: 15,
            }}
          />
          {loading && (
            <span style={{ fontSize: 12, opacity: 0.4 }}>searching...</span>
          )}
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {results.length === 0 && query.trim() && !loading && (
            <div style={{ padding: "24px 16px", textAlign: "center", opacity: 0.4, fontSize: 13 }}>
              No results found
            </div>
          )}
          {results.map((r, idx) => (
            <div
              key={`${r.id}-${idx}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 16px",
                cursor: "pointer",
                background: idx === selectedIdx ? "rgba(110, 231, 255, 0.13)" : "transparent",
                transition: "background 0.1s",
              }}
              onMouseEnter={() => setSelectedIdx(idx)}
              onClick={() => {
                onSelectResult(r);
                onClose();
              }}
            >
              <span style={{ fontSize: 18, flexShrink: 0 }}>{contentTypeIcon(r.contentType)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span
                    style={{
                      fontSize: 14,
                      color: MAP_THEME.text,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {r.file}
                  </span>
                  {r.matchedChunk && (
                    <span style={{ fontSize: 12, opacity: 0.4, flexShrink: 0 }}>
                      {r.matchedChunk.label}
                    </span>
                  )}
                </div>
                {r.taxonomyPath && r.taxonomyPath.length > 0 && (
                  <div style={{ fontSize: 11, opacity: 0.35, marginTop: 2 }}>
                    {r.taxonomyPath.join(" > ")}
                  </div>
                )}
              </div>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: scoreColor(r.score),
                  flexShrink: 0,
                }}
              >
                {r.score.toFixed(2)}
              </span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 16px",
            borderTop: `1px solid ${MAP_THEME.border}`,
            fontSize: 11,
            opacity: 0.4,
          }}
        >
          <span>
            <kbd style={kbdStyle}>{"\u2191"}</kbd>
            <kbd style={kbdStyle}>{"\u2193"}</kbd> navigate{" "}
            <kbd style={kbdStyle}>{"Enter"}</kbd> open{" "}
            <kbd style={kbdStyle}>Esc</kbd> close
          </span>
          <span>
            {results.length} result{results.length !== 1 ? "s" : ""}
            {queryTime !== null && ` \u00B7 ${queryTime.toFixed(0)}ms`}
          </span>
        </div>
      </div>
    </div>
  );
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
