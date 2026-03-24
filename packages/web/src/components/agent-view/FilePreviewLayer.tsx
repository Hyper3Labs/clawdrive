import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useState, useEffect } from "react";
import type { ProjectionPoint } from "../../types";
import {
  getModalityColor,
  getModalityLabel,
  getPreviewKind,
  MAP_THEME,
  MINI_CARD_Z_RANGE,
} from "../../theme";
import { useVisualizationStore } from "./useVisualizationStore";

const MAX_PREVIEWS = 14;
const PREVIEW_DISTANCE = 17;
const PREVIEW_DISTANCE_SQ = PREVIEW_DISTANCE * PREVIEW_DISTANCE;

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

function trimName(name: string): string {
  if (name.length <= 28) return name;
  return `${name.slice(0, 25)}...`;
}

// Memoized card — only re-renders when point.id changes, not on hover state
function PreviewCard({
  point,
  onHover,
  onLeave,
  onSelect,
}: {
  point: ProjectionPoint;
  onHover: () => void;
  onLeave: () => void;
  onSelect: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const [localHover, setLocalHover] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const color = getModalityColor(point.contentType);
  const label = getModalityLabel(point.contentType);
  const kind = getPreviewKind(point.contentType);

  useEffect(() => {
    setImageFailed(false);
  }, [point.id]);

  return (
    // Invisible padding area for forgiving hover detection
    <div
      onMouseEnter={() => {
        clearTimeout(leaveTimer.current);
        setLocalHover(true);
        onHover();
      }}
      onMouseLeave={() => {
        leaveTimer.current = setTimeout(() => {
          setLocalHover(false);
          onLeave();
        }, 150);
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      style={{ padding: 8, margin: -8, cursor: "pointer" }}
    >
      <div
        style={{
          width: 128,
          borderRadius: 10,
          border: `1px solid ${localHover ? color : MAP_THEME.border}`,
          overflow: "hidden",
          background: "rgba(8, 20, 29, 0.88)",
          backdropFilter: "blur(8px)",
          boxShadow: localHover
            ? `0 10px 28px rgba(0,0,0,0.45), 0 0 0 1px ${color}44`
            : "0 8px 20px rgba(0,0,0,0.35)",
          transition: "border-color 120ms ease, box-shadow 120ms ease",
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
    </div>
  );
}

export function FilePreviewLayer({ points }: FilePreviewLayerProps) {
  const [previewIds, setPreviewIds] = useState<string[]>([]);
  const frameCount = useRef(0);
  const { camera } = useThree();
  const clickedFileId = useVisualizationStore((s) => s.clickedFileId);
  const hoverFile = useVisualizationStore((s) => s.hoverFile);
  const clickFile = useVisualizationStore((s) => s.clickFile);

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
        .map((point) => (
          <Html
            key={point.id}
            position={[point.x, point.y + 1.25, point.z]}
            transform
            sprite
            distanceFactor={15}
            zIndexRange={MINI_CARD_Z_RANGE}
          >
            <PreviewCard
              point={point}
              onHover={() => hoverFile(point.id)}
              onLeave={() => hoverFile(null)}
              onSelect={() => clickFile(point.id)}
            />
          </Html>
        ))}
    </>
  );
}
