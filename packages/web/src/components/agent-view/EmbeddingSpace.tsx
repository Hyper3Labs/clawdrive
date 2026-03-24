import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { PointCloud } from "./PointCloud";
import { ClusterLabels } from "./ClusterLabels";
import { ExpandablePreview } from "./ExpandablePreview";
import { PotsSidebar } from "./PotsSidebar";
import { useVisualizationStore } from "./useVisualizationStore";
import { FilePreviewLayer } from "./FilePreviewLayer";
import { MapCameraRig } from "./MapCameraRig";
import { useProjections } from "./useProjections";
import { useMemo, useRef, useState, useEffect } from "react";
import type { ProjectionPoint } from "../../types";
import { MAP_THEME } from "../../theme";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

interface EmbeddingSpaceProps {
  focusFileId: string | null;
}

export function EmbeddingSpace({ focusFileId }: EmbeddingSpaceProps) {
  const { points, loading, error } = useProjections();
  const [hovered, setHovered] = useState<ProjectionPoint | null>(null);
  const [selected, setSelected] = useState<ProjectionPoint | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const recordInteraction = useVisualizationStore((s) => s.recordInteraction);
  const clickedFileId = useVisualizationStore((s) => s.clickedFileId);
  const clickFile = useVisualizationStore((s) => s.clickFile);
  const hoverFile = useVisualizationStore((s) => s.hoverFile);

  // When modal is dismissed (clickedFileId cleared), also clear local selected/hovered
  useEffect(() => {
    if (clickedFileId === null) {
      setSelected(null);
      setHovered(null);
    }
  }, [clickedFileId]);

  useEffect(() => {
    if (!focusFileId) return;
    const match = points.find((point) => point.id === focusFileId) ?? null;
    if (match) setSelected(match);
  }, [focusFileId, points]);

  useEffect(() => {
    if (!selected) return;
    const stillExists = points.find((point) => point.id === selected.id);
    if (!stillExists) setSelected(null);
  }, [points, selected]);

  const focusTarget = useMemo(() => {
    if (!focusFileId) return null;
    const anchor = points.find((point) => point.id === focusFileId);
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
  }, [focusFileId, points]);

  // Only focus camera when driven by external focusFileId prop (e.g. search result),
  // never by user clicks on points — those just open the preview modal.
  const cameraTarget = focusTarget;

  if (loading)
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flex: 1,
          opacity: 0.7,
          color: MAP_THEME.text,
          background: "radial-gradient(circle at top, #0b1d2a 0%, #061018 60%)",
        }}
      >
        Loading projections...
      </div>
    );
  if (error)
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flex: 1,
          color: "#ff8d8d",
          background: "radial-gradient(circle at top, #0b1d2a 0%, #061018 60%)",
        }}
      >
        Error: {error}
      </div>
    );
  if (points.length === 0)
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flex: 1,
          opacity: 0.72,
          color: MAP_THEME.text,
          background: "radial-gradient(circle at top, #0b1d2a 0%, #061018 60%)",
        }}
      >
        No files added yet. Use cdrive pot add or cdrive serve --demo nasa.
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
      <PotsSidebar />
      <Canvas camera={{ position: [0, 0, 50], fov: 60 }} onPointerMissed={() => {
        // Only clear if modal is not open (PreviewCard clicks trigger onPointerMissed
        // because the HTML overlay isn't a Three.js object)
        if (!useVisualizationStore.getState().clickedFileId) {
          setSelected(null);
          clickFile(null);
        }
      }}>
        <color attach="background" args={[MAP_THEME.background]} />
        <fog attach="fog" args={[MAP_THEME.background, 50, 120]} />
        <ambientLight intensity={0.32} />
        <directionalLight position={[20, 25, 10]} intensity={0.46} color={MAP_THEME.accentPrimary} />
        <pointLight position={[-24, -16, 12]} intensity={0.34} color={MAP_THEME.accentSecondary} />

        <PointCloud
          points={points}
          selectedId={selected?.id ?? null}
          onHover={(p) => { setHovered(p); hoverFile(p?.id ?? null); }}
          onSelect={(p) => { setSelected(p); clickFile(p?.id ?? null); }}
        />
        <FilePreviewLayer
          points={points}
          onHover={(p) => { setHovered(p); hoverFile(p?.id ?? null); }}
          onSelect={(p) => { setSelected(p); clickFile(p?.id ?? null); }}
        />
        <ClusterLabels points={points} />

        <MapCameraRig
          focusTarget={cameraTarget}
          controlsRef={controlsRef}
        />
        <OrbitControls
          ref={controlsRef}
          enableDamping
          dampingFactor={0.05}
          minDistance={8}
          maxDistance={140}
          onStart={() => recordInteraction()}
          onEnd={() => recordInteraction()}
        />
      </Canvas>
      <ExpandablePreview points={points} />
    </div>
  );
}
