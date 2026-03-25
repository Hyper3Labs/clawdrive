import { useState, useEffect, useRef, useCallback } from "react";
import { listShareInbox, approveShare, revokeShare } from "../../api";
import { useToast } from "./Toast";
import { MAP_THEME, Z_INDEX } from "../../theme";
import type { PotShare } from "../../types";
import { Link } from "lucide-react";

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
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: "rgba(255,255,255,0.06)",
          border: `1px solid ${MAP_THEME.border}`,
          borderRadius: 6,
          padding: "6px 12px",
          color: MAP_THEME.text,
          fontSize: 12,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontFamily: "inherit",
          position: "relative",
        }}
        title="Share inbox"
      >
        <Link size={14} />
        Shares
        {items.length > 0 && (
          <span style={{
            background: MAP_THEME.accentWarm,
            color: MAP_THEME.background,
            fontSize: 9, fontWeight: 700,
            minWidth: 16, height: 16, borderRadius: "50%",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            padding: "0 4px",
          }}>
            {items.length}
          </span>
        )}
      </button>
      {open && (
        <div style={{
          position: "absolute",
          right: 0,
          top: "100%",
          marginTop: 4,
          width: 280,
          zIndex: Z_INDEX.contextMenu,
          background: MAP_THEME.panel,
          border: `1px solid ${MAP_THEME.border}`,
          borderRadius: 8,
          padding: 12,
          boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: MAP_THEME.text, marginBottom: 8 }}>
            Pending Shares
          </div>
          {items.length === 0 ? (
            <div style={{ fontSize: 11, opacity: 0.4, textAlign: "center", padding: 12 }}>
              No pending shares
            </div>
          ) : (
            items.map((s) => (
              <div
                key={s.id}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.05)",
                  fontSize: 12, color: MAP_THEME.text,
                }}
              >
                <span style={{ flex: 1 }}>
                  {s.pot_slug}
                  <span style={{ opacity: 0.4, marginLeft: 6, fontSize: 10 }}>
                    {new Date(s.created_at).toLocaleDateString()}
                  </span>
                </span>
                <button
                  onClick={() => handleApprove(s.id)}
                  style={{
                    background: "rgba(123,211,137,0.15)", border: "none", borderRadius: 4,
                    color: MAP_THEME.accentSecondary, fontSize: 11, padding: "2px 8px",
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  Approve
                </button>
                <button
                  onClick={() => handleReject(s.id)}
                  style={{
                    background: "rgba(255,141,141,0.15)", border: "none", borderRadius: 4,
                    color: MAP_THEME.accentDanger, fontSize: 11, padding: "2px 8px",
                    cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  Reject
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
