import { useState, useEffect } from "react";
import { Z_INDEX } from "../../theme";
import { cx, ui } from "./ui";

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
      style={{ zIndex: Z_INDEX.modal }}
      className="fixed inset-0 bg-black/60 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cx(ui.panel, "flex max-h-[70vh] w-[600px] flex-col")}
      >
        <div className="px-4 py-3 border-b border-[var(--border)] font-semibold text-sm text-[var(--text)]">
          Edit Digest
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          className="flex-1 min-h-[200px] m-4 p-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-[var(--text)] text-[13px] leading-[1.6] font-mono resize-y outline-none focus:border-[var(--accent)] transition-colors"
          placeholder="Write markdown digest..."
        />
        <div className="px-4 py-3 border-t border-[var(--border)] flex justify-end gap-2">
          <button
            onClick={onClose}
            className={cx(ui.subtleButton, "bg-transparent px-4 text-[13px]")}
          >
            Cancel
          </button>
          <button
            onClick={() => { onSave(draft); onClose(); }}
            className="cursor-pointer rounded-md border-none bg-[var(--accent)] px-4 py-1.5 text-[13px] font-semibold text-[var(--bg)] transition-opacity hover:opacity-90"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
