import { useState, useEffect } from "react";
import { listPots } from "../../api";
import { MAP_THEME, MODALITY_COLORS } from "../../theme";
import type { PotRecord } from "../../types";

export interface SearchFilterState {
  types: string[];
  pot: string | null;
  tags: string[];
}

interface SearchFiltersProps {
  value: SearchFilterState;
  onChange: (filters: SearchFilterState) => void;
}

const TYPE_OPTIONS = [
  { label: "PDF", value: "application/pdf", color: MODALITY_COLORS.pdf },
  { label: "Image", value: "image/", color: MODALITY_COLORS.image },
  { label: "Video", value: "video/", color: MODALITY_COLORS.video },
  { label: "Audio", value: "audio/", color: MODALITY_COLORS.audio },
  { label: "Text", value: "text/", color: MODALITY_COLORS.text },
];

export function SearchFilters({ value, onChange }: SearchFiltersProps) {
  const [pots, setPots] = useState<PotRecord[]>([]);

  useEffect(() => {
    listPots().then((res) => setPots(res.pots ?? [])).catch(() => {});
  }, []);

  function toggleType(type: string) {
    const next = value.types.includes(type)
      ? value.types.filter((t) => t !== type)
      : [...value.types, type];
    onChange({ ...value, types: next });
  }

  function setPot(slug: string | null) {
    onChange({ ...value, pot: slug });
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", padding: "4px 0" }}>
      {TYPE_OPTIONS.map((opt) => {
        const active = value.types.includes(opt.value);
        return (
          <button
            key={opt.value}
            onClick={() => toggleType(opt.value)}
            style={{
              padding: "2px 8px",
              borderRadius: 4,
              border: `1px solid ${active ? opt.color : "rgba(255,255,255,0.1)"}`,
              background: active ? `${opt.color}20` : "transparent",
              color: active ? opt.color : MAP_THEME.textMuted,
              fontSize: 10,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {opt.label}
          </button>
        );
      })}
      {pots.length > 0 && (
        <select
          value={value.pot ?? ""}
          onChange={(e) => setPot(e.target.value || null)}
          style={{
            background: "rgba(255,255,255,0.05)",
            border: `1px solid ${MAP_THEME.border}`,
            borderRadius: 4,
            color: MAP_THEME.text,
            fontSize: 10,
            padding: "2px 6px",
            outline: "none",
            fontFamily: "inherit",
          }}
        >
          <option value="">All pots</option>
          {pots.map((p) => (
            <option key={p.id} value={p.slug}>{p.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}

export const EMPTY_FILTERS: SearchFilterState = { types: [], pot: null, tags: [] };
