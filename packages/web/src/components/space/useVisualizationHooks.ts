import { useMemo } from "react";
import type { ProjectionPoint } from "../../types";
import { useVisualizationStore } from "./useVisualizationStore";

/** Resolve clickedFileId from the store to a full ProjectionPoint. */
export function useClickedPoint(points: ProjectionPoint[]): ProjectionPoint | null {
  const clickedFileId = useVisualizationStore((s) => s.clickedFileId);
  return useMemo(
    () => points.find((p) => p.id === clickedFileId) ?? null,
    [points, clickedFileId],
  );
}

/** Resolve hoveredFileId from the store to a full ProjectionPoint. */
export function useHoveredPoint(points: ProjectionPoint[]): ProjectionPoint | null {
  const hoveredFileId = useVisualizationStore((s) => s.hoveredFileId);
  return useMemo(
    () => points.find((p) => p.id === hoveredFileId) ?? null,
    [points, hoveredFileId],
  );
}
