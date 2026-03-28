import { Canvas } from "@react-three/fiber";
import { CameraControls } from "@react-three/drei";
import { PointCloud } from "./PointCloud";

import { ExpandablePreview } from "./ExpandablePreview";

import { useVisualizationStore } from "./useVisualizationStore";
import { FilePreviewLayer } from "./FilePreviewLayer";
import { MapCameraRig } from "./MapCameraRig";
import { useProjections } from "./useProjections";
import { useMemo, useRef, useEffect, type CSSProperties } from "react";
import { MAP_THEME } from "../../theme";
import type CameraControlsImpl from "camera-controls";

const STATUS_STYLE: CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  flex: 1, background: "radial-gradient(circle at top, #0b1d2a 0%, #061018 60%)",
};

interface EmbeddingSpaceProps {
  focusFileId: string | null;
}

export function EmbeddingSpace({ focusFileId }: EmbeddingSpaceProps) {
  const { points, loading, error } = useProjections();
  const controlsRef = useRef<CameraControlsImpl | null>(null);
  const clickFile = useVisualizationStore((s) => s.clickFile);
  const hoverFile = useVisualizationStore((s) => s.hoverFile);
  const clickedFileId = useVisualizationStore((s) => s.clickedFileId);
  const lastConsumedFocusId = useRef<string | null>(null);

  useEffect(() => {
    if (!focusFileId || focusFileId === lastConsumedFocusId.current) return;
    const match = points.find((point) => point.id === focusFileId);
    if (match) {
      clickFile(match.id);
      lastConsumedFocusId.current = focusFileId;
    }
  }, [focusFileId, points, clickFile]);

  const focusAnchorId = clickedFileId ?? focusFileId;

  const focusTarget = useMemo(() => {
    if (!focusAnchorId) return null;
    const anchor = points.find((point) => point.id === focusAnchorId);
    if (!anchor) return null;

    const nearest = points
      .map((point) => {
        const dx = point.x - anchor.x;
        const dy = point.y - anchor.y;
        const dz = point.z - anchor.z;
        return { point, distSq: dx * dx + dy * dy + dz * dz };
      })
      .sort((a, b) => a.distSq - b.distSq)
      .slice(0, Math.min(18, points.length));

    let sumW = 0;
    let x = 0;
    let y = 0;
    let z = 0;

    nearest.forEach(({ point, distSq }) => {
      const w = 1 / (1 + distSq);
      sumW += w;
      x += point.x * w;
      y += point.y * w;
      z += point.z * w;
    });

    if (sumW === 0) return { x: anchor.x, y: anchor.y, z: anchor.z };
    return { x: x / sumW, y: y / sumW, z: z / sumW };
  }, [focusAnchorId, points]);

  const cameraTargetKey = focusAnchorId ?? "overview";

  if (loading)
    return (
      <div style={{ ...STATUS_STYLE, opacity: 0.7, color: MAP_THEME.text }}>
        Loading projections...
      </div>
    );
  if (error)
    return (
      <div style={{ ...STATUS_STYLE, color: "#ff8d8d" }}>
        Error: {error}
      </div>
    );
  if (points.length === 0)
    return (
      <div style={{ ...STATUS_STYLE, opacity: 0.72, color: MAP_THEME.text }}>
        No files added yet. Use cdrive add or cdrive serve --demo nasa.
      </div>
    );

  return (
    <div
      style={{
        flex: 1,
        position: "relative",
        minHeight: 0,
        background:
          "radial-gradient(circle at 20% 10%, rgba(32, 70, 90, 0.45) 0%, rgba(6, 16, 24, 0.96) 45%, rgba(3, 9, 14, 1) 100%)",
      }}
    >
      <Canvas camera={{ position: [0, 0, 50], fov: 60 }} onPointerMissed={() => {
        // Guard: don't clear when modal is open — HTML overlays trigger onPointerMissed
        if (!useVisualizationStore.getState().clickedFileId) {
          hoverFile(null);
        }
      }}>
        <color attach="background" args={[MAP_THEME.background]} />
        <fog attach="fog" args={[MAP_THEME.background, 50, 120]} />
        <ambientLight intensity={0.32} />
        <directionalLight position={[20, 25, 10]} intensity={0.46} color={MAP_THEME.accentPrimary} />
        <pointLight position={[-24, -16, 12]} intensity={0.34} color={MAP_THEME.accentSecondary} />

        <PointCloud points={points} />
        <FilePreviewLayer points={points} />

        <MapCameraRig
          focusTarget={focusTarget}
          focusKey={cameraTargetKey}
          controlsRef={controlsRef}
        />
        <CameraControls
          ref={controlsRef}
          makeDefault
        />
      </Canvas>
      <ExpandablePreview points={points} />
    </div>
  );
}
