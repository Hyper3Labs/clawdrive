import { useState, useEffect, useRef, useCallback } from "react";
import { listShareInbox, approveShare, revokeShare } from "../../api";
import { useToast } from "./Toast";
import { Z_INDEX } from "../../theme";
import type { PotShare } from "../../types";
import { Link } from "lucide-react";
import { cx, ui } from "./ui";

export function ShareInbox() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PotShare[]>([]);
  const { show } = useToast();
  const ref = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await listShareInbox();
      setItems(res.items ?? []);
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    let interval: ReturnType<typeof setInterval> | null = setInterval(refresh, 30_000);

    function handleVisibility() {
      if (document.visibilityState === "visible") {
        refresh();
        if (!interval) interval = setInterval(refresh, 30_000);
      } else {
        if (interval) { clearInterval(interval); interval = null; }
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function handleApprove(id: string) {
    try {
      await approveShare(id);
      show("Share approved", { type: "success" });
      refresh();
    } catch { show("Failed to approve", { type: "error" }); }
  }

  async function handleReject(id: string) {
    try {
      await revokeShare(id);
      show("Share rejected", { type: "info" });
      refresh();
    } catch { show("Failed to reject", { type: "error" }); }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="group relative inline-flex items-center justify-center gap-2 px-4 h-[40px] text-[13px] rounded-xl font-bold border border-[#1f3647]/50 bg-[#0e1a24] text-[#e6f0f7] hover:bg-white/5 hover:border-[#6ee7ff]/30 hover:text-white shadow-inner transition-all"
        title="Share inbox"
      >
        <Link size={16} className="text-[#6b8a9e] group-hover:text-[#6ee7ff]" />
        Shares
        {items.length > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-[#ffb84d] text-[#0a0a0f] text-[10px] font-bold min-w-[18px] h-[18px] rounded-full inline-flex items-center justify-center px-1 shadow-sm">
            {items.length}
          </span>
        )}
      </button>
      {open && (
        <div
          style={{ zIndex: Z_INDEX.contextMenu }}
          className={cx(ui.popover, "absolute right-0 top-full mt-2 w-[320px] overflow-hidden rounded-xl p-0")}
        >
          <div className="border-b border-white/5 px-4 py-3 text-[13px] font-semibold text-[var(--text)]">
            Pending Shares
          </div>
          {items.length === 0 ? (
            <div className={cx(ui.emptyState, "py-6 text-[12px]")}>
              No pending shares
            </div>
          ) : (
            items.map((s) => (
              <div
                key={s.id}
                className="border-b border-white/5 px-4 py-3 text-[12px] text-[var(--text)] last:border-0"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-medium">
                    {s.pot_slug}
                  </span>
                  <span className="shrink-0 text-[10px] text-[var(--textMuted)]">
                    {new Date(s.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleApprove(s.id)}
                    className="inline-flex items-center rounded-md border border-[rgba(123,211,137,0.24)] bg-[rgba(123,211,137,0.12)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent-secondary)] transition-opacity hover:opacity-90"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleReject(s.id)}
                    className="inline-flex items-center rounded-md border border-[rgba(255,141,141,0.24)] bg-[rgba(255,141,141,0.12)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent-danger)] transition-opacity hover:opacity-90"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
