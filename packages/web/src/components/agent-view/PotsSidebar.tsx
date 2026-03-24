import { useEffect, useState, useRef } from "react";
import { MAP_THEME, Z_INDEX } from "../../theme";
import { useVisualizationStore } from "./useVisualizationStore";

function ContextMenu({
  x, y, potId, potName, onClose,
}: {
  x: number; y: number; potId: string; potName: string; onClose: () => void;
}) {
  const renamePot = useVisualizationStore((s) => s.renamePot);
  const deletePotAction = useVisualizationStore((s) => s.deletePot);
  const recordInteraction = useVisualizationStore((s) => s.recordInteraction);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(potName);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  if (renaming) {
    return (
      <div ref={menuRef} style={{
        position: "fixed", left: x, top: y, zIndex: Z_INDEX.contextMenu,
        background: MAP_THEME.panel, border: `1px solid ${MAP_THEME.border}`,
        borderRadius: 8, padding: 8, minWidth: 160,
      }}>
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === "Enter" && newName.trim()) {
              await renamePot(potId, newName.trim());
              recordInteraction();
              onClose();
            }
            if (e.key === "Escape") onClose();
          }}
          style={{
            width: "100%", background: MAP_THEME.background,
            border: `1px solid ${MAP_THEME.border}`, borderRadius: 4,
            padding: "4px 8px", color: MAP_THEME.text, fontSize: 12, outline: "none",
          }}
        />
      </div>
    );
  }

  return (
    <div ref={menuRef} style={{
      position: "fixed", left: x, top: y, zIndex: Z_INDEX.contextMenu,
      background: MAP_THEME.panel, border: `1px solid ${MAP_THEME.border}`,
      borderRadius: 8, padding: 4, minWidth: 120,
    }}>
      <div
        onClick={() => setRenaming(true)}
        style={{
          padding: "6px 12px", fontSize: 12, color: MAP_THEME.text,
          cursor: "pointer", borderRadius: 4,
        }}
        onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "rgba(110, 231, 255, 0.08)"; }}
        onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "transparent"; }}
      >
        Rename
      </div>
      <div
        onClick={async () => {
          await deletePotAction(potId);
          recordInteraction();
          onClose();
        }}
        style={{
          padding: "6px 12px", fontSize: 12, color: "#ff8d8d",
          cursor: "pointer", borderRadius: 4,
        }}
        onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "rgba(255, 100, 100, 0.08)"; }}
        onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "transparent"; }}
      >
        Delete
      </div>
    </div>
  );
}

export function PotsSidebar() {
  const pots = useVisualizationStore((s) => s.pots);
  const selectedPotId = useVisualizationStore((s) => s.selectedPotId);
  const selectPot = useVisualizationStore((s) => s.selectPot);
  const fetchPots = useVisualizationStore((s) => s.fetchPots);
  const createPotAction = useVisualizationStore((s) => s.createPot);
  const potFileIds = useVisualizationStore((s) => s.potFileIds);
  const recordInteraction = useVisualizationStore((s) => s.recordInteraction);

  const [collapsed, setCollapsed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newPotName, setNewPotName] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; potId: string; potName: string } | null>(null);

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
        <span style={{ color: "#6B8A9E", fontSize: 14 }}>▶</span>
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
          return (
            <div
              key={pot.id}
              onClick={() => {
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
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{
                  color: isSelected ? MAP_THEME.text : "#9AB",
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
            </div>
          );
        })}
        {pots.length === 0 && !creating && (
          <div style={{ padding: "16px 12px", color: "#6B8A9E", fontSize: 12, textAlign: "center" }}>
            No pots yet
          </div>
        )}
      </div>

      {/* Collapse */}
      <div style={{ padding: "8px 16px", borderTop: `1px solid ${MAP_THEME.border}` }}>
        <div
          onClick={() => setCollapsed(true)}
          style={{ color: "#6B8A9E", fontSize: 11, cursor: "pointer", textAlign: "center" }}
        >
          ◀ Collapse
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          potId={contextMenu.potId}
          potName={contextMenu.potName}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
