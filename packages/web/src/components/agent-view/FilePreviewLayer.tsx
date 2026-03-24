import * as THREE from "three";
import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useState, useEffect } from "react";
import type { ProjectionPoint } from "../../types";
import {
  getModalityColor,
  getModalityLabel,
  MAP_THEME,
  MINI_CARD_Z_RANGE,
} from "../../theme";
import { useVisualizationStore } from "./useVisualizationStore";

const MAX_PREVIEWS = 14;
const PREVIEW_DISTANCE = 17;
const PREVIEW_DISTANCE_SQ = PREVIEW_DISTANCE * PREVIEW_DISTANCE;
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

// Memoized card — only re-renders when point.id changes, not on hover state
const CARD_ICONS: Record<string, string> = {
  pdf: "\u{1F4C4}",   // 📄
  audio: "\u{1F3B5}", // 🎵
  video: "\u{1F3AC}", // 🎬
  text: "\u{1F4DD}",  // 📝
};

function CardThumbnail({ point }: { point: ProjectionPoint }) {
  const [imageFailed, setImageFailed] = useState(false);
  const color = getModalityColor(point.contentType);
  const label = getModalityLabel(point.contentType);
  const kind = point.contentType.startsWith("image/") ? "image" :
               point.contentType.startsWith("video/") ? "video" :
               point.contentType.startsWith("audio/") ? "audio" :
               point.contentType.startsWith("application/pdf") ? "pdf" : "text";

  useEffect(() => { setImageFailed(false); }, [point.id]);

  // Images and videos: use thumbnail API (real rendered image)
  if ((kind === "image" || kind === "video") && !imageFailed) {
    return (
      <img
        src={`/api/files/${encodeURIComponent(point.id)}/thumbnail`}
        alt={point.fileName}
        loading="lazy"
        onError={() => setImageFailed(true)}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
    );
  }

  // PDF: try thumbnail API (qlmanage renders first page)
  if (kind === "pdf" && !imageFailed) {
    return (
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        <img
          src={`/api/files/${encodeURIComponent(point.id)}/thumbnail`}
          alt={point.fileName}
          loading="lazy"
          onError={() => setImageFailed(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      </div>
    );
  }

  // Audio, text, failed images: show icon + colored background
  const icon = CARD_ICONS[kind] || CARD_ICONS.text;
  return (
    <div style={{
      width: "100%", height: "100%",
      display: "flex", alignItems: "center", justifyContent: "center",
      background: `linear-gradient(135deg, ${color}15, ${color}08)`,
    }}>
      <span style={{ fontSize: 22 }}>{icon}</span>
    </div>
  );
}

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
  const [localHover, setLocalHover] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const color = getModalityColor(point.contentType);
  const label = getModalityLabel(point.contentType);

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
        title={point.fileName}
        style={{
          width: 72,
          height: 72,
          borderRadius: 10,
          border: `1px solid ${localHover ? color : MAP_THEME.border}`,
          overflow: "hidden",
          background: "rgba(8, 20, 29, 0.88)",
          backdropFilter: "blur(8px)",
          boxShadow: localHover
            ? `0 10px 28px rgba(0,0,0,0.45), 0 0 0 1px ${color}44`
            : "0 8px 20px rgba(0,0,0,0.35)",
          transition: "border-color 120ms ease, box-shadow 120ms ease",
          position: "relative",
        }}
      >
        <CardThumbnail point={point} />
        <div style={{
          position: "absolute", bottom: 3, left: 3,
          padding: "1px 5px", borderRadius: 4,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
          fontSize: 7, fontWeight: 700, letterSpacing: 0.5,
          color, lineHeight: 1.4,
        }}>
          {label}
        </div>
      </div>
    </div>
  );
}

export function FilePreviewLayer({ points }: FilePreviewLayerProps) {
  const [previewIds, setPreviewIds] = useState<string[]>([]);
  const previewIdsRef = useRef<string[]>([]);
  const frameCount = useRef(0);
  const { camera, size } = useThree();
  const clickedFileId = useVisualizationStore((s) => s.clickedFileId);
  const hoverFile = useVisualizationStore((s) => s.hoverFile);
  const clickFile = useVisualizationStore((s) => s.clickFile);

  const pointById = useMemo(() => {
    return new Map(points.map((point) => [point.id, point]));
  }, [points]);

  const tmpVec = useMemo(() => new THREE.Vector3(), []);

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
