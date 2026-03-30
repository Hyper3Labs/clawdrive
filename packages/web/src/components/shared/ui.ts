export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export const ui = {
  panel:
    "rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-[0_8px_40px_rgba(0,0,0,0.45)]",
  popover:
    "rounded-lg border border-[var(--border)] bg-[var(--panel)] shadow-[0_4px_20px_rgba(0,0,0,0.5)]",
  subtleButton:
    "inline-flex items-center justify-center gap-1.5 rounded-md border border-[var(--border)] bg-white/5 px-3 py-1.5 text-xs text-[var(--text)] transition-colors hover:bg-white/10",
  subtleButtonCompact:
    "inline-flex items-center justify-center gap-1 rounded-md border border-[var(--border)] bg-white/5 px-2.5 py-1 text-[11px] text-[var(--text)] transition-colors hover:bg-white/10",
  iconButton:
    "inline-flex h-7 w-7 items-center justify-center rounded-md bg-transparent text-[var(--textMuted)] transition-colors hover:bg-white/10 hover:text-[var(--text)]",
  input:
    "w-full rounded-md border border-[var(--border)] bg-white/5 px-2.5 py-1.5 text-xs text-[var(--text)] outline-none transition-colors focus:border-[var(--accent-primary)]",
  eyebrow: "text-[10px] uppercase tracking-[0.08em] text-[var(--textMuted)]",
  sectionLabel: "mb-1 text-[11px] uppercase tracking-[0.05em] text-white/40",
  emptyState: "p-6 text-center text-[13px] text-white/40",
  accentChip:
    "rounded-md border border-[rgba(110,231,255,0.25)] bg-[rgba(110,231,255,0.08)] text-[var(--accent-primary)]",
  previewFrame:
    "overflow-hidden rounded-xl border border-[var(--border)] bg-[rgba(10,19,28,0.7)]",
};