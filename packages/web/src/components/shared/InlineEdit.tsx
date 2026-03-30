import { useState, useRef, useEffect } from "react";
import { cx, ui } from "./ui";

interface InlineEditProps {
  value: string;
  placeholder?: string;
  onSave: (value: string) => void;
}

export function InlineEdit({ value, placeholder, onSave }: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setDraft(value); }, [value]);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      ref.current.style.height = "auto";
      ref.current.style.height = ref.current.scrollHeight + "px";
    }
  }, [editing]);

  function handleSave() {
    const trimmed = draft.trim();
    if (trimmed !== value) onSave(trimmed);
    setEditing(false);
  }

  if (!editing) {
    return (
      <div
        onClick={() => setEditing(true)}
        className={`cursor-pointer text-xs leading-[1.6] ${value ? 'text-[var(--text)] opacity-70 not-italic' : 'text-[var(--textMuted)] opacity-40 italic'}`}
      >
        {value || placeholder || "Click to edit..."}
      </div>
    );
  }

  return (
    <textarea
      ref={ref}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        e.target.style.height = "auto";
        e.target.style.height = e.target.scrollHeight + "px";
      }}
      onBlur={handleSave}
      onKeyDown={(e) => {
        if (e.key === "Escape") { setDraft(value); setEditing(false); }
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSave();
      }}
      className={cx(
        ui.input,
        "box-border resize-none overflow-hidden border-[var(--accent-primary)] px-2 py-1 text-xs leading-[1.6]",
      )}
      rows={1}
    />
  );
}
