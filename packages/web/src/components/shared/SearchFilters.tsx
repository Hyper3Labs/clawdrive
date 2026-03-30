import { useState, useEffect } from "react";
import { listPots } from "../../api";
import { MODALITY_COLORS } from "../../theme";
import type { PotRecord } from "../../types";
import { cx, ui } from "./ui";

export interface SearchFilterState {
  types: string[];
  pot: string | null;
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
    <div className="flex flex-wrap items-center gap-2 py-0.5">
      {TYPE_OPTIONS.map((opt) => {
        const active = value.types.includes(opt.value);
        return (
          <button
            key={opt.value}
            onClick={() => toggleType(opt.value)}
            style={{
              borderColor: active ? opt.color : "var(--border-strong)",
              background: active ? `${opt.color}20` : "var(--surface-1)",
              color: active ? opt.color : "var(--text-muted)",
            }}
            className="cursor-pointer rounded-md border px-2.5 py-1 text-[11px] font-medium tracking-[0.02em] transition-opacity hover:opacity-90"
          >
            {opt.label}
          </button>
        );
      })}
      {pots.length > 0 && (
        <select
          value={value.pot ?? ""}
          onChange={(e) => setPot(e.target.value || null)}
          className={cx(ui.input, "h-8 min-w-[128px] w-auto rounded-md px-2.5 py-1 text-[11px]")}
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

export const EMPTY_FILTERS: SearchFilterState = { types: [], pot: null };
