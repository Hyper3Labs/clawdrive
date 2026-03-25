import { useState, useEffect } from "react";
import { MAP_THEME, Z_INDEX } from "../../theme";

interface DigestModalProps {
  value: string;
  onSave: (value: string) => void;
  onClose: () => void;
}

export function DigestModal({ value, onSave, onClose }: DigestModalProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: Z_INDEX.modal,
        background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: MAP_THEME.panel,
          border: `1px solid ${MAP_THEME.border}`,
          borderRadius: 12,
          width: 600,
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{
          padding: "12px 16px",
          borderBottom: `1px solid ${MAP_THEME.border}`,
          fontWeight: 600,
          fontSize: 14,
          color: MAP_THEME.text,
        }}>
          Edit Digest
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          style={{
            flex: 1,
            minHeight: 200,
            margin: 16,
            padding: 12,
            background: "rgba(255,255,255,0.03)",
            border: `1px solid ${MAP_THEME.border}`,
            borderRadius: 8,
            color: MAP_THEME.text,
            fontSize: 13,
            lineHeight: 1.6,
            fontFamily: "'SF Mono', 'Fira Code', monospace",
            resize: "vertical",
            outline: "none",
          }}
          placeholder="Write markdown digest..."
        />
        <div style={{
          padding: "12px 16px",
          borderTop: `1px solid ${MAP_THEME.border}`,
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
        }}>
          <button
            onClick={onClose}
            style={{
              padding: "6px 16px", borderRadius: 6, border: `1px solid ${MAP_THEME.border}`,
              background: "transparent", color: MAP_THEME.text, cursor: "pointer",
              fontSize: 13, fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => { onSave(draft); onClose(); }}
            style={{
              padding: "6px 16px", borderRadius: 6, border: "none",
              background: MAP_THEME.accentPrimary, color: MAP_THEME.background,
              cursor: "pointer", fontWeight: 600, fontSize: 13, fontFamily: "inherit",
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
