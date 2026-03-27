import { useState, useEffect } from "react";
import { useVisualizationStore } from "../space/useVisualizationStore";
import { ContextMenu } from "../shared/ContextMenu";
import { FileSearchPicker } from "../shared/FileSearchPicker";
import { useToast } from "../shared/Toast";
import { MAP_THEME } from "../../theme";
import { getFileTags, listPotFiles } from "../../api";
import type { PotRecord } from "../../types";

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
    <div style={{ padding: "8px 0" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "4px 12px", marginBottom: 4,
      }}>
        <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.4, color: MAP_THEME.text }}>
          Pots
        </span>
        <button
          onClick={() => setCreating(true)}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: MAP_THEME.accentPrimary, fontSize: 14, padding: 0, lineHeight: 1,
          }}
        >
          +
        </button>
      </div>

      {/* Create input */}
      {creating && (
        <div style={{ padding: "0 12px", marginBottom: 4 }}>
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
            style={{
              width: "100%", background: "rgba(255,255,255,0.05)",
              border: `1px solid ${MAP_THEME.accentPrimary}`, borderRadius: 4,
              color: MAP_THEME.text, fontSize: 12, padding: "4px 8px",
              outline: "none", fontFamily: "inherit", boxSizing: "border-box",
            }}
          />
        </div>
      )}

      {/* Pot list */}
      {pots.length === 0 && !creating && (
        <div style={{ padding: "4px 12px", fontSize: 11, opacity: 0.3, color: MAP_THEME.text }}>
          No pots yet
        </div>
      )}
      {pots.map((pot) => (
        <div
          key={pot.id}
          onClick={() => onSelectPot(selectedSlug === pot.slug ? null : pot.slug)}
          onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, pot }); }}
          style={{
            padding: "5px 12px",
            cursor: "pointer",
            fontSize: 12,
            color: selectedSlug === pot.slug ? MAP_THEME.accentPrimary : MAP_THEME.text,
            background: selectedSlug === pot.slug ? "rgba(110,231,255,0.08)" : "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
          onMouseEnter={(e) => {
            if (selectedSlug !== pot.slug) e.currentTarget.style.background = "rgba(255,255,255,0.03)";
          }}
          onMouseLeave={(e) => {
            if (selectedSlug !== pot.slug) e.currentTarget.style.background = "transparent";
          }}
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
              style={{
                background: "rgba(255,255,255,0.05)",
                border: `1px solid ${MAP_THEME.accentPrimary}`,
                borderRadius: 3, color: MAP_THEME.text, fontSize: 12,
                padding: "1px 4px", outline: "none", fontFamily: "inherit",
                width: "100%",
              }}
            />
          ) : (
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {pot.name}
            </span>
          )}
        </div>
      ))}

      {/* Add files button when pot selected */}
      {selectedSlug && (
        <div style={{ padding: "6px 12px" }}>
          <button
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setPickerAnchor(pickerAnchor ? null : { x: rect.right + 4, y: rect.top });
            }}
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px dashed rgba(255,255,255,0.15)",
              borderRadius: 4,
              color: MAP_THEME.textMuted,
              fontSize: 11,
              padding: "4px 8px",
              cursor: "pointer",
              fontFamily: "inherit",
              width: "100%",
            }}
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
