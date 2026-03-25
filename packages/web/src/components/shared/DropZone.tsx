import { useState, useRef, type ReactNode, type DragEvent } from "react";
import { MAP_THEME, Z_INDEX } from "../../theme";

interface DropZoneProps {
  onDrop: (files: File[]) => void;
  disabled?: boolean;
  label?: string;
  children: ReactNode;
  nested?: boolean;
}

export function DropZone({
  onDrop,
  disabled,
  label = "Drop files here",
  children,
  nested,
}: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const dragCounter = useRef(0);

  function handleDragEnter(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    dragCounter.current++;
    if (dragCounter.current === 1) setDragOver(true);
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragOver(false);
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setDragOver(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) onDrop(files);
  }

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}
    >
      {children}
      {dragOver && (
        <div
          style={{
            position: nested ? "absolute" : "fixed",
            inset: 0,
            zIndex: Z_INDEX.overlay,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(6, 16, 24, 0.85)",
            border: `2px dashed ${MAP_THEME.accentPrimary}`,
            borderRadius: nested ? 8 : 0,
            pointerEvents: "none",
          }}
        >
          <span style={{
            color: MAP_THEME.accentPrimary,
            fontSize: 16,
            fontWeight: 600,
          }}>
            {label}
          </span>
        </div>
      )}
    </div>
  );
}
