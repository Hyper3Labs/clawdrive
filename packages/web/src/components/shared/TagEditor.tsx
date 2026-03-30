import { useState } from "react";
import { cx, ui } from "./ui";

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
    <div className="flex flex-wrap gap-1 items-center">
      {tags.map((tag) => (
        <span
          key={tag}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border ${
            isPotTag(tag) 
              ? 'bg-[var(--accent-green)]/15 text-[var(--accent-green)] border-[var(--accent-green)]/30' 
              : 'bg-[var(--surface-2)] text-[var(--text)] border-[var(--border-strong)]'
          }`}
        >
          {tag}
          {!isPotTag(tag) && (
            <button
              onClick={() => handleRemove(tag)}
              className="bg-transparent border-none cursor-pointer text-[var(--text-muted)] text-sm p-0 leading-none hover:text-white transition-colors"
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
          className={cx(ui.input, "w-20 border-[var(--accent)] px-2 py-0.5 text-[11px]")}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="cursor-pointer rounded border border-dashed border-[var(--border-subtle)] bg-[var(--surface-2)] px-2 py-0.5 text-[11px] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-3)] hover:text-white"
        >
          + tag
        </button>
      )}
    </div>
  );
}
