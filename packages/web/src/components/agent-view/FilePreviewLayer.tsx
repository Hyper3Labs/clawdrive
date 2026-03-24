import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useState, useEffect } from "react";
import type { ProjectionPoint } from "../../types";
import {
  getModalityColor,
  getModalityLabel,
  getPreviewKind,
  MAP_THEME,
} from "../../theme";
import { useVisualizationStore } from "./useVisualizationStore";

const MAX_PREVIEWS = 14;
const PREVIEW_DISTANCE = 17;
const PREVIEW_DISTANCE_SQ = PREVIEW_DISTANCE * PREVIEW_DISTANCE;

interface FilePreviewLayerProps {
  points: ProjectionPoint[];
  hoveredId: string | null;
  selectedId: string | null;
  onHover: (point: ProjectionPoint | null) => void;
  onSelect: (point: ProjectionPoint | null) => void;
}

function arraysEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function trimName(name: string): string {
  if (name.length <= 28) return name;
  return `${name.slice(0, 25)}...`;
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
  const [imageFailed, setImageFailed] = useState(false);
  const color = getModalityColor(point.contentType);
  const label = getModalityLabel(point.contentType);
  const kind = getPreviewKind(point.contentType);

  useEffect(() => {
    setImageFailed(false);
  }, [point.id]);

  return (
    <div
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      style={{
        width: 128,
        borderRadius: 10,
        border: `1px solid ${active ? color : MAP_THEME.border}`,
        overflow: "hidden",
        background: "rgba(8, 20, 29, 0.88)",
        backdropFilter: "blur(8px)",
        boxShadow: active
          ? `0 10px 28px rgba(0,0,0,0.45), 0 0 0 1px ${color}44`
          : "0 8px 20px rgba(0,0,0,0.35)",
        cursor: "pointer",
        transition: "transform 120ms ease, border-color 120ms ease",
        transform: active ? "translateY(-2px) scale(1.02)" : "none",
      }}
    >
      <div style={{ height: 84, background: "rgba(10, 20, 28, 0.92)" }}>
        {kind === "image" && point.previewUrl && !imageFailed ? (
          <img
            src={point.previewUrl}
            alt={point.fileName}
            loading="lazy"
            onError={() => setImageFailed(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color,
              fontSize: 18,
              letterSpacing: 1,
              fontWeight: 700,
            }}
          >
            {label}
          </div>
        )}
      </div>
      <div style={{ padding: "6px 8px 7px" }}>
        <div
          style={{
            fontSize: 9,
            letterSpacing: 0.8,
            color,
            marginBottom: 3,
            fontWeight: 700,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 10,
            color: MAP_THEME.text,
            lineHeight: 1.2,
            wordBreak: "break-word",
          }}
        >
          {trimName(point.fileName)}
        </div>
      </div>
    </div>
  );
}

export function FilePreviewLayer({
  points,
  hoveredId,
  selectedId,
  onHover,
  onSelect,
}: FilePreviewLayerProps) {
  const [previewIds, setPreviewIds] = useState<string[]>([]);
  const frameCount = useRef(0);
  const { camera } = useThree();
  const clickedFileId = useVisualizationStore((s) => s.clickedFileId);

  const pointById = useMemo(() => {
    return new Map(points.map((point) => [point.id, point]));
  }, [points]);

  useFrame(() => {
    frameCount.current += 1;
    if (frameCount.current % 8 !== 0) return;

    const cam = camera.position;
    const nearest = points
      .map((point) => {
        const dx = point.x - cam.x;
        const dy = point.y - cam.y;
        const dz = point.z - cam.z;
        return { id: point.id, distSq: dx * dx + dy * dy + dz * dz };
      })
      .filter((entry) => entry.distSq <= PREVIEW_DISTANCE_SQ)
      .sort((a, b) => a.distSq - b.distSq)
      .slice(0, MAX_PREVIEWS)
      .map((entry) => entry.id);

    if (selectedId && !nearest.includes(selectedId)) nearest.unshift(selectedId);
    if (hoveredId && !nearest.includes(hoveredId)) nearest.unshift(hoveredId);

    const finalIds = nearest.slice(0, MAX_PREVIEWS);
    if (!arraysEqual(previewIds, finalIds)) {
      setPreviewIds(finalIds);
    }
  });

  // Hide all preview cards when modal is open
  if (clickedFileId) return null;

  return (
    <>
      {previewIds
        .map((id) => pointById.get(id))
        .filter((point): point is ProjectionPoint => Boolean(point))
        .map((point) => {
          const active = point.id === hoveredId || point.id === selectedId;
          return (
            <Html
              key={point.id}
              position={[point.x, point.y + 1.25, point.z]}
              transform
              sprite
              distanceFactor={15}
              zIndexRange={[100, 0]}
            >
              <PreviewCard
                point={point}
                active={active}
                onHover={() => onHover(point)}
                onLeave={() => onHover(null)}
                onSelect={() => onSelect(point)}
              />
            </Html>
          );
        })}
    </>
  );
}
