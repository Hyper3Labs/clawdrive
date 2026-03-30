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
              ? 'bg-[rgba(123,211,137,0.15)] text-[var(--accent-secondary)] border-[rgba(123,211,137,0.3)]' 
              : 'bg-white/5 text-[var(--text)] border-white/10'
          }`}
        >
          {tag}
          {!isPotTag(tag) && (
            <button
              onClick={() => handleRemove(tag)}
              className="bg-transparent border-none cursor-pointer text-[var(--textMuted)] text-sm p-0 leading-none hover:text-white transition-colors"
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
          className={cx(ui.input, "w-20 border-[var(--accent-primary)] px-2 py-0.5 text-[11px]")}
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="cursor-pointer rounded border border-dashed border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-[var(--textMuted)] transition-colors hover:bg-white/10 hover:text-white"
        >
          + tag
        </button>
      )}
    </div>
  );
}
