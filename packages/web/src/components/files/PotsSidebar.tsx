import { useState, useEffect } from "react";
import { useVisualizationStore } from "../space/useVisualizationStore";
import { ContextMenu } from "../shared/ContextMenu";
import { FileSearchPicker } from "../shared/FileSearchPicker";
import { useToast } from "../shared/Toast";
import { getFileTags, listPotFiles } from "../../api";
import type { PotRecord } from "../../types";
import { Plus } from "lucide-react";
import { cx, ui } from "../shared/ui";

interface PotsSidebarProps {
  selectedSlug: string | null;
  onSelectPot: (slug: string | null) => void;
  onPotContentChanged?: () => void;
}

export function PotsSidebar({ selectedSlug, onSelectPot, onPotContentChanged }: PotsSidebarProps) {
  const pots = useVisualizationStore((s) => s.pots);
  const fetchPots = useVisualizationStore((s) => s.fetchPots);
  const createPot = useVisualizationStore((s) => s.createPot);
  const [localPotFileIds, setLocalPotFileIds] = useState<Set<string>>(new Set());
  const renamePot = useVisualizationStore((s) => s.renamePot);
  const deletePot = useVisualizationStore((s) => s.deletePot);
  const assignFileToPot = useVisualizationStore((s) => s.assignFileToPot);
  const { show } = useToast();

  const [creating, setCreating] = useState(false);
  const [newPotName, setNewPotName] = useState("");
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; pot: PotRecord } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [pickerAnchor, setPickerAnchor] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => { fetchPots(); }, [fetchPots]);

  // Fetch pot file IDs locally — don't touch the shared store's selectedPotId
  useEffect(() => {
    if (!selectedSlug) { setLocalPotFileIds(new Set()); return; }
    listPotFiles(selectedSlug)
      .then((data) => {
        const ids = new Set<string>((data.items ?? []).map((f: { id: string }) => f.id));
        setLocalPotFileIds(ids);
      })
      .catch(() => setLocalPotFileIds(new Set()));
  }, [selectedSlug]);

  async function handleAddFileToPot(fileId: string) {
    if (!selectedSlug) return;
    try {
      const res = await getFileTags(fileId);
      const tags = res.tags ?? [];
      await assignFileToPot(fileId, selectedSlug, tags);
      // Refresh local file IDs and notify parent to re-fetch grid
      setLocalPotFileIds((prev) => new Set([...prev, fileId]));
      onPotContentChanged?.();
      show("File added to pot", { type: "success" });
    } catch {
      show("Failed to add file", { type: "error" });
    }
  }

  return (
    <div className="space-y-2 px-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between px-2 pb-3 border-b border-white/5 mb-4">
        <span className={cx(ui.eyebrow, "text-[12px] font-bold tracking-[0.2em] text-[#6b8a9e]")}>
          Pots
        </span>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-[#6ee7ff] transition-all hover:bg-[#6ee7ff]/10 hover:border-[#6ee7ff]/30 hover:-translate-y-0.5"
          title="Create pot"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Create input */}
      {creating && (
        <div className="px-2 pb-1">
          <input
            autoFocus
            value={newPotName}
            onChange={(e) => setNewPotName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newPotName.trim()) {
                createPot(newPotName.trim());
                setNewPotName("");
                setCreating(false);
              }
              if (e.key === "Escape") { setNewPotName(""); setCreating(false); }
            }}
            onBlur={() => { setNewPotName(""); setCreating(false); }}
            placeholder="Pot name..."
            className="block box-border w-full rounded-xl border border-[rgba(110,231,255,0.28)] bg-white/[0.04] px-3 py-2 text-[13px] text-[var(--text)] outline-none placeholder:text-[rgba(230,240,247,0.3)]"
          />
        </div>
      )}

      {/* Pot list */}
      {pots.length === 0 && !creating && (
        <div className="rounded-xl border border-dashed border-[#1f3647]/50 bg-[#0e1a24]/50 px-5 py-6 text-center text-[13px] text-[#6b8a9e] m-2">
          No pots yet.<br/><span className="text-[11px] opacity-70 mt-1 block">Create one to organize files.</span>
        </div>
      )}
      {pots.map((pot) => {
        const isSelected = selectedSlug === pot.slug;
        return (
          <div
            key={pot.id}
            onClick={() => onSelectPot(isSelected ? null : pot.slug)}
            onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, pot }); }}
            className={`mb-2.5 flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 text-[14px] font-medium transition-all duration-200 ${
              isSelected
                ? "border-[#6ee7ff]/40 bg-[linear-gradient(180deg,rgba(110,231,255,0.15)_0%,rgba(110,231,255,0.05)_100%)] text-[#e6f0f7] shadow-md shadow-[#6ee7ff]/10"
                : "border-white/5 bg-white/5 text-[#6b8a9e] hover:border-white/20 hover:bg-white/10 hover:text-white hover:-translate-y-0.5"
            }`}
          >
            {renamingId === pot.id ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && renameValue.trim()) {
                    renamePot(pot.id, renameValue.trim());
                    setRenamingId(null);
                  }
                  if (e.key === "Escape") setRenamingId(null);
                }}
                onBlur={() => setRenamingId(null)}
                className="w-full rounded-md border border-[rgba(110,231,255,0.28)] bg-white/[0.04] px-2 py-1.5 text-[13px] text-[var(--text)] outline-none"
              />
            ) : (
              <span className="block w-full overflow-hidden text-ellipsis whitespace-nowrap font-medium">
                {pot.name}
              </span>
            )}
            {isSelected && renamingId !== pot.id && (
              <span className="ml-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-primary)]" />
            )}
          </div>
        );
      })}

      {/* Add files button when pot selected */}
      {selectedSlug && (
        <div className="px-2 pt-1">
          <button
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setPickerAnchor(pickerAnchor ? null : { x: rect.right + 4, y: rect.top });
            }}
            className={cx(
              ui.subtleButton,
              "w-full justify-center rounded-lg border-dashed py-1.5 text-[11px] text-[var(--textMuted)] hover:text-[var(--text)]",
            )}
          >
            + Add files
          </button>
          {pickerAnchor && (
            <FileSearchPicker
              onSelect={(fileId) => handleAddFileToPot(fileId)}
              excludeIds={localPotFileIds}
              onClose={() => setPickerAnchor(null)}
              anchorX={pickerAnchor.x}
              anchorY={pickerAnchor.y}
            />
          )}
        </div>
      )}

      {/* Context menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={[
            {
              label: "Rename",
              onClick: () => { setRenamingId(ctxMenu.pot.id); setRenameValue(ctxMenu.pot.name); },
            },
            {
              label: "Delete",
              danger: true,
              onClick: () => { deletePot(ctxMenu.pot.id); if (selectedSlug === ctxMenu.pot.slug) onSelectPot(null); },
            },
          ]}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
}
