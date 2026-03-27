import { useEffect, useState } from "react";
import { MAP_THEME, Z_INDEX } from "../../theme";
import { useVisualizationStore } from "./useVisualizationStore";
import { ContextMenu } from "../shared/ContextMenu";

export function PotsSidebar() {
  const pots = useVisualizationStore((s) => s.pots);
  const selectedPotId = useVisualizationStore((s) => s.selectedPotId);
  const selectPot = useVisualizationStore((s) => s.selectPot);
  const fetchPots = useVisualizationStore((s) => s.fetchPots);
  const createPotAction = useVisualizationStore((s) => s.createPot);
  const deletePot = useVisualizationStore((s) => s.deletePot);
  const renamePot = useVisualizationStore((s) => s.renamePot);
  const potFileIds = useVisualizationStore((s) => s.potFileIds);
  const recordInteraction = useVisualizationStore((s) => s.recordInteraction);

  const [collapsed, setCollapsed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newPotName, setNewPotName] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; potId: string; potName: string } | null>(null);
  const [renamingPotId, setRenamingPotId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    fetchPots();
  }, [fetchPots]);

  if (collapsed) {
    return (
      <div
        onClick={() => { setCollapsed(false); recordInteraction(); }}
        style={{
          position: "absolute", left: 0, top: 0, bottom: 0, width: 40,
          background: "rgba(14, 26, 36, 0.85)", backdropFilter: "blur(12px)",
          borderRight: `1px solid ${MAP_THEME.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", zIndex: Z_INDEX.sidebar,
        }}
      >
        <span style={{ color: MAP_THEME.textMuted, fontSize: 14 }}>▶</span>
      </div>
    );
  }

  return (
    <div style={{
      position: "absolute", left: 0, top: 0, bottom: 0, width: 220,
      background: "rgba(14, 26, 36, 0.92)", backdropFilter: "blur(12px)",
      borderRight: `1px solid ${MAP_THEME.border}`,
      display: "flex", flexDirection: "column", zIndex: Z_INDEX.sidebar,
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 16px 12px", display: "flex",
        justifyContent: "space-between", alignItems: "center",
        borderBottom: `1px solid ${MAP_THEME.border}`,
      }}>
        <span style={{
          color: MAP_THEME.accentPrimary, fontSize: 12,
          textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 600,
        }}>
          Pots
        </span>
        <div
          onClick={() => { setCreating(true); recordInteraction(); }}
          style={{
            width: 24, height: 24, borderRadius: 6,
            background: "rgba(110, 231, 255, 0.1)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: MAP_THEME.accentPrimary, fontSize: 16, cursor: "pointer",
          }}
        >
          +
        </div>
      </div>

      {/* Create input */}
      {creating && (
        <div style={{ padding: "8px 16px" }}>
          <input
            autoFocus
            placeholder="Pot name..."
            value={newPotName}
            onChange={(e) => setNewPotName(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter" && newPotName.trim()) {
                await createPotAction(newPotName.trim());
                setNewPotName("");
                setCreating(false);
                recordInteraction();
              }
              if (e.key === "Escape") {
                setNewPotName("");
                setCreating(false);
              }
            }}
            onBlur={() => {
              if (!newPotName.trim()) {
                setCreating(false);
                setNewPotName("");
              }
            }}
            style={{
              width: "100%", background: MAP_THEME.background,
              border: `1px solid ${MAP_THEME.border}`, borderRadius: 6,
              padding: "6px 10px", color: MAP_THEME.text, fontSize: 12, outline: "none",
            }}
          />
        </div>
      )}

      {/* Pot list */}
      <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
        {pots.map((pot) => {
          const isSelected = pot.id === selectedPotId;
          const isRenaming = renamingPotId === pot.id;
          return (
            <div
              key={pot.id}
              onClick={() => {
                if (isRenaming) return;
                selectPot(isSelected ? null : pot.id);
                recordInteraction();
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, potId: pot.id, potName: pot.name });
              }}
              style={{
                padding: "10px 12px", borderRadius: 8, marginBottom: 4, cursor: "pointer",
                background: isSelected ? "rgba(110, 231, 255, 0.08)" : "transparent",
                border: isSelected ? "1px solid rgba(110, 231, 255, 0.25)" : "1px solid transparent",
                transition: "background 120ms ease",
              }}
            >
              {isRenaming ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && renameValue.trim()) {
                      await renamePot(pot.id, renameValue.trim());
                      recordInteraction();
                      setRenamingPotId(null);
                    }
                    if (e.key === "Escape") {
                      setRenamingPotId(null);
                    }
                  }}
                  onBlur={() => setRenamingPotId(null)}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    width: "100%", background: MAP_THEME.background,
                    border: `1px solid ${MAP_THEME.border}`, borderRadius: 4,
                    padding: "4px 8px", color: MAP_THEME.text, fontSize: 12, outline: "none",
                  }}
                />
              ) : (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{
                    color: isSelected ? MAP_THEME.text : MAP_THEME.textMuted,
                    fontSize: 13, fontWeight: isSelected ? 500 : 400,
                  }}>
                    {pot.name}
                  </span>
                  {isSelected && potFileIds.size > 0 && (
                    <span style={{ color: MAP_THEME.accentPrimary, fontSize: 11 }}>
                      {potFileIds.size}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {pots.length === 0 && !creating && (
          <div style={{ padding: "16px 12px", color: MAP_THEME.textMuted, fontSize: 12, textAlign: "center" }}>
            No pots yet
          </div>
        )}
      </div>

      {/* Collapse */}
      <div style={{ padding: "8px 16px", borderTop: `1px solid ${MAP_THEME.border}` }}>
        <div
          onClick={() => setCollapsed(true)}
          style={{ color: MAP_THEME.textMuted, fontSize: 11, cursor: "pointer", textAlign: "center" }}
        >
          ◀ Collapse
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            {
              label: "Rename",
              onClick: () => {
                setRenamingPotId(contextMenu.potId);
                setRenameValue(contextMenu.potName);
              },
            },
            {
              label: "Delete",
              danger: true,
              onClick: () => {
                deletePot(contextMenu.potId);
                recordInteraction();
              },
            },
          ]}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
