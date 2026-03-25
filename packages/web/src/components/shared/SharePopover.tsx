import { useState, useEffect, useRef } from "react";
import { createShare, listPotShares, revokeShare } from "../../api";
import { useToast } from "./Toast";
import { MAP_THEME, Z_INDEX } from "../../theme";
import type { PotShare } from "../../types";

interface SharePopoverProps {
  potSlug: string;
  onClose: () => void;
  anchorX: number;
  anchorY: number;
}

const STATUS_COLORS: Record<string, string> = {
  active: MAP_THEME.accentSecondary,
  pending: MAP_THEME.accentWarm,
  revoked: "#ff8d8d",
  expired: MAP_THEME.textMuted,
};

export function SharePopover({ potSlug, onClose, anchorX, anchorY }: SharePopoverProps) {
  const [shares, setShares] = useState<PotShare[]>([]);
  const [loading, setLoading] = useState(true);
  const { show } = useToast();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listPotShares(potSlug)
      .then((res) => setShares(res.items ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [potSlug]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  async function handleCreateLink() {
    try {
      await createShare(potSlug, { kind: "link", role: "read" });
      show("Share link created (pending approval)", { type: "success" });
      const res = await listPotShares(potSlug);
      setShares(res.items ?? []);
    } catch {
      show("Failed to create share", { type: "error" });
    }
  }

  async function handleRevoke(id: string) {
    try {
      await revokeShare(id);
      show("Share revoked", { type: "success" });
      setShares((prev) => prev.map((s) => (s.id === id ? { ...s, status: "revoked" as const } : s)));
    } catch {
      show("Failed to revoke", { type: "error" });
    }
  }

  function copyLink(token: string) {
    navigator.clipboard.writeText(`${window.location.origin}/s/${token}`);
    show("Link copied", { type: "success" });
  }

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: anchorX,
        top: anchorY,
        zIndex: Z_INDEX.contextMenu,
        background: MAP_THEME.panel,
        border: `1px solid ${MAP_THEME.border}`,
        borderRadius: 8,
        padding: 12,
        width: 260,
        boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: MAP_THEME.text, marginBottom: 8 }}>
        Share Pot
      </div>

      <button
        onClick={handleCreateLink}
        style={{
          width: "100%",
          padding: "8px 12px",
          borderRadius: 6,
          border: `1px solid ${MAP_THEME.border}`,
          background: "rgba(255,255,255,0.04)",
          color: MAP_THEME.accentPrimary,
          fontSize: 12,
          cursor: "pointer",
          fontFamily: "inherit",
          marginBottom: 8,
        }}
      >
        Create public link
      </button>

      {loading ? (
        <div style={{ fontSize: 11, opacity: 0.4, textAlign: "center", padding: 8 }}>Loading...</div>
      ) : shares.length === 0 ? (
        <div style={{ fontSize: 11, opacity: 0.4, textAlign: "center", padding: 8 }}>No shares yet</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {shares.map((s) => (
            <div
              key={s.id}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "4px 0", fontSize: 11, color: MAP_THEME.text,
              }}
            >
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                background: STATUS_COLORS[s.status] ?? MAP_THEME.textMuted,
                flexShrink: 0,
              }} />
              <span style={{ flex: 1 }}>{s.kind === "link" ? "Link" : s.principal}</span>
              <span style={{ opacity: 0.5, fontSize: 10 }}>{s.status}</span>
              {s.status === "active" && s.token && (
                <button
                  onClick={() => copyLink(s.token!)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: MAP_THEME.accentPrimary, fontSize: 10, padding: 0,
                  }}
                >
                  Copy
                </button>
              )}
              {(s.status === "active" || s.status === "pending") && (
                <button
                  onClick={() => handleRevoke(s.id)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "#ff8d8d", fontSize: 10, padding: 0,
                  }}
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
