export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export const ui = {
  panel:
    "rounded-xl border border-[var(--border)] bg-[var(--bg-panel)] shadow-lg",
  popover:
    "rounded-lg border border-[var(--border)] bg-[var(--bg-panel)] shadow",
  card: "rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] hover:bg-[var(--surface-hover)] hover:border-[var(--border-strong)] transition-all duration-150",
  subtleButton:
    "inline-flex items-center justify-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-sm text-[var(--text)] transition-colors hover:bg-[var(--surface-3)]",
  subtleButtonCompact:
    "inline-flex items-center justify-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-xs text-[var(--text)] transition-colors hover:bg-[var(--surface-3)]",
  btnPrimary:
    "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium bg-[var(--accent)] text-[var(--bg)] transition-colors",
  btnDanger:
    "inline-flex items-center justify-center gap-1.5 rounded-md border border-[var(--accent-danger)]/30 px-3 py-1.5 text-sm text-[var(--accent-danger)] transition-colors hover:bg-[var(--accent-danger)]/10",
  iconButton:
    "inline-flex h-7 w-7 items-center justify-center rounded-md bg-transparent text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
  input:
    "w-full rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5 text-xs text-[var(--text)] outline-none transition-colors focus:border-[var(--accent-a35)]",
  eyebrow: "text-xs uppercase tracking-wider text-[var(--text-muted)]",
  sectionLabel: "mb-1 text-xs uppercase tracking-wider text-[var(--text-faint)]",
  emptyState: "p-6 text-center text-base text-[var(--text-faint)]",
  accentChip:
    "rounded-md border border-[var(--accent-a20)] bg-[var(--accent-a10)] text-[var(--accent)]",
  previewFrame:
    "overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-overlay)]",
  disabled: "opacity-40 cursor-not-allowed",
};
