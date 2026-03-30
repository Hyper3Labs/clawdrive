import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import type { ProjectionPoint } from "../../types";
import {
  getModalityColor,
  getModalityLabel,
  MINI_CARD_Z_RANGE,
} from "../../theme";
import { useVisualizationStore } from "./useVisualizationStore";
import { MapPreviewSurface } from "./MapPreviewSurface";
import { cx, ui } from "../shared/ui";

const MAX_PREVIEWS = 6;
const PREVIEW_DISTANCE = 15;
const PREVIEW_DISTANCE_SQ = PREVIEW_DISTANCE * PREVIEW_DISTANCE;
const PREVIEW_UPDATE_INTERVAL = 0.28;
const SIDEBAR_EXCLUSION_PX = 240; // sidebar width (220) + margin (20)

interface FilePreviewLayerProps {
  points: ProjectionPoint[];
}

function arraysEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function PreviewCard({
  point,
  active,
  onHover,
  onLeave,
  onSelect,
}: {
  point: ProjectionPoint;
  active: boolean;
  onHover: () => void;
  onLeave: () => void;
  onSelect: () => void;
}) {
  const color = getModalityColor(point.contentType);
  const label = getModalityLabel(point.contentType);

  return (
    <div
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      className="-m-2 cursor-pointer p-2"
    >
      <div className="flex flex-col items-center gap-[3px]">
        <div
          className={cx(ui.previewFrame, "w-32 rounded-[10px] bg-[rgba(8,20,29,0.96)] transition-transform duration-150")}
          style={{
            borderColor: active ? color : "var(--border)",
            boxShadow: active
              ? `0 10px 24px rgba(0,0,0,0.38), 0 0 0 1px ${color}44`
              : "0 8px 16px rgba(0,0,0,0.28)",
            transform: active ? "translateY(-2px) scale(1.02)" : "none",
          }}
        >
          <MapPreviewSurface point={point} variant="card" />
        </div>
        <div
          className="max-w-[140px] overflow-hidden text-ellipsis whitespace-nowrap rounded-[3px] bg-[rgba(6,16,24,0.75)] px-1.5 py-px text-[8px] font-bold leading-[1.2] tracking-[0.5px]"
          style={{ color }}
        >
          {label} · {point.fileName.replace(/\.[^.]+$/, "")}
        </div>
      </div>
    </div>
  );
}

export function FilePreviewLayer({ points }: FilePreviewLayerProps) {
  const [previewIds, setPreviewIds] = useState<string[]>([]);
  const previewIdsRef = useRef<string[]>([]);
  const lastUpdateAt = useRef(0);
  const { camera, size } = useThree();
  const clickedFileId = useVisualizationStore((s) => s.clickedFileId);
  const hoverFile = useVisualizationStore((s) => s.hoverFile);
  const clickFile = useVisualizationStore((s) => s.clickFile);
  const selectedPotId = useVisualizationStore((s) => s.selectedPotId);
  const potFileIds = useVisualizationStore((s) => s.potFileIds);

  const pointById = useMemo(() => {
    return new Map(points.map((point) => [point.id, point]));
  }, [points]);

  const tmpVec = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    if (state.clock.elapsedTime - lastUpdateAt.current < PREVIEW_UPDATE_INTERVAL) return;
    lastUpdateAt.current = state.clock.elapsedTime;

    // When a pot is selected, only show previews for files in that pot
    const eligible = selectedPotId && potFileIds.size > 0
      ? points.filter((p) => potFileIds.has(p.id))
      : points;

    const cam = camera.position;
    const nearest = eligible
      .map((point) => {
        const dx = point.x - cam.x;
        const dy = point.y - cam.y;
        const dz = point.z - cam.z;
        return { id: point.id, distSq: dx * dx + dy * dy + dz * dz };
      })
      .filter((entry) => entry.distSq <= PREVIEW_DISTANCE_SQ)
      .sort((a, b) => a.distSq - b.distSq);

    const filtered = nearest.filter((entry) => {
      const point = pointById.get(entry.id);
      if (!point) return false;
      tmpVec.set(point.x, point.y, point.z);
      tmpVec.project(camera);
      // Convert NDC (-1 to 1) to screen pixels
      const screenX = (tmpVec.x * 0.5 + 0.5) * size.width;
      return screenX > SIDEBAR_EXCLUSION_PX;
    });

    const finalIds = filtered.slice(0, MAX_PREVIEWS).map((entry) => entry.id);
    if (!arraysEqual(previewIdsRef.current, finalIds)) {
      previewIdsRef.current = finalIds;
      setPreviewIds(finalIds);
    }
  });

  const hoveredFileId = useVisualizationStore((s) => s.hoveredFileId);

  // Hide all preview cards when modal is open
  if (clickedFileId) return null;

  // Show a hover card for any point not already in the visible set
  const hoveredPoint = hoveredFileId && !previewIds.includes(hoveredFileId)
    ? pointById.get(hoveredFileId) ?? null
    : null;

  return (
    <>
      {previewIds
        .map((id) => pointById.get(id))
        .filter((point): point is ProjectionPoint => Boolean(point))
        .map((point) => {
          const active = point.id === hoveredFileId;
          return (
          <Html
            key={point.id}
            position={[point.x, point.y + 1.25, point.z]}
            transform
            sprite
            distanceFactor={15}
            zIndexRange={MINI_CARD_Z_RANGE}
            occlude
          >
            <PreviewCard
              point={point}
              active={active}
              onHover={() => hoverFile(point.id)}
              onLeave={() => hoverFile(null)}
              onSelect={() => clickFile(point.id)}
            />
          </Html>
        );
        })}
      {hoveredPoint && (
        <Html
          key={`hover-${hoveredPoint.id}`}
          position={[hoveredPoint.x, hoveredPoint.y + 1.25, hoveredPoint.z]}
          transform
          sprite
          distanceFactor={15}
          zIndexRange={MINI_CARD_Z_RANGE}
          occlude
        >
          <PreviewCard
            point={hoveredPoint}
            active
            onHover={() => hoverFile(hoveredPoint.id)}
            onLeave={() => hoverFile(null)}
            onSelect={() => clickFile(hoveredPoint.id)}
          />
        </Html>
      )}
    </>
  );
}
