import { useState, useRef, useEffect } from "react";
import { MAP_THEME } from "../../theme";

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
        style={{
          cursor: "pointer",
          color: value ? MAP_THEME.text : MAP_THEME.textMuted,
          fontSize: 12,
          lineHeight: 1.6,
          opacity: value ? 0.7 : 0.4,
          fontStyle: value ? "normal" : "italic",
        }}
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
      style={{
        width: "100%",
        background: "rgba(255,255,255,0.05)",
        border: `1px solid ${MAP_THEME.accentPrimary}`,
        borderRadius: 4,
        color: MAP_THEME.text,
        fontSize: 12,
        lineHeight: 1.6,
        padding: "4px 8px",
        resize: "none",
        overflow: "hidden",
        fontFamily: "inherit",
        outline: "none",
        boxSizing: "border-box",
      }}
      rows={1}
    />
  );
}
