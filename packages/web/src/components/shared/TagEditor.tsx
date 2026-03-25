import { useState } from "react";
import { MAP_THEME } from "../../theme";

interface TagEditorProps {
  tags: string[];
  onChange: (tags: string[]) => void;
}

export function TagEditor({ tags, onChange }: TagEditorProps) {
  const [adding, setAdding] = useState(false);
  const [newTag, setNewTag] = useState("");

  const isPotTag = (tag: string) => tag.startsWith("pot:");

  function handleAdd() {
    const trimmed = newTag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setNewTag("");
    setAdding(false);
  }

  function handleRemove(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
      {tags.map((tag) => (
        <span
          key={tag}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 8px",
            borderRadius: 4,
            fontSize: 11,
            background: isPotTag(tag) ? "rgba(123, 211, 137, 0.15)" : "rgba(255,255,255,0.06)",
            color: isPotTag(tag) ? MAP_THEME.accentSecondary : MAP_THEME.text,
            border: `1px solid ${isPotTag(tag) ? "rgba(123,211,137,0.3)" : "rgba(255,255,255,0.1)"}`,
          }}
        >
          {tag}
          {!isPotTag(tag) && (
            <button
              onClick={() => handleRemove(tag)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: MAP_THEME.textMuted, fontSize: 14, padding: 0, lineHeight: 1,
              }}
            >
              ×
            </button>
          )}
        </span>
      ))}
      {adding ? (
        <input
          autoFocus
          value={newTag}
          onChange={(e) => setNewTag(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
            if (e.key === "Escape") { setNewTag(""); setAdding(false); }
          }}
          onBlur={handleAdd}
          placeholder="tag name"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: `1px solid ${MAP_THEME.accentPrimary}`,
            borderRadius: 4,
            color: MAP_THEME.text,
            fontSize: 11,
            padding: "2px 8px",
            outline: "none",
            width: 80,
            fontFamily: "inherit",
          }}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px dashed rgba(255,255,255,0.15)",
            borderRadius: 4,
            color: MAP_THEME.textMuted,
            fontSize: 11,
            padding: "2px 8px",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          + tag
        </button>
      )}
    </div>
  );
}
