import { useState, useRef, type ReactNode, type DragEvent } from "react";

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
      className="relative flex-1 flex flex-col min-h-0"
    >
      {children}
      {dragOver && (
        <div
          className={`${nested ? 'absolute rounded-lg' : 'fixed rounded-none'} z-overlay inset-0 flex items-center justify-center bg-[rgba(6,16,24,0.85)] border-2 border-dashed border-[var(--accent)] pointer-events-none`}
        >
          <span className="text-[var(--accent)] text-base font-semibold">
            {label}
          </span>
        </div>
      )}
    </div>
  );
}
