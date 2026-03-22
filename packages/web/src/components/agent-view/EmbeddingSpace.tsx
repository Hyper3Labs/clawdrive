import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { PointCloud } from "./PointCloud";
import { ClusterLabels } from "./ClusterLabels";
import { HoverCard } from "./HoverCard";
import { useProjections } from "./useProjections";
import { useState } from "react";
import type { ProjectionPoint } from "../../types";

export function EmbeddingSpace() {
  const { points, loading, error } = useProjections();
  const [hovered, setHovered] = useState<ProjectionPoint | null>(null);

  if (loading)
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flex: 1,
          opacity: 0.3,
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
          color: "#f87171",
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
          opacity: 0.3,
        }}
      >
        No files stored yet. Use `clawdrive store` to add files.
      </div>
    );

  return (
    <div style={{ flex: 1, position: "relative" }}>
      <Canvas camera={{ position: [0, 0, 50], fov: 60 }}>
        <ambientLight intensity={0.5} />
        <PointCloud points={points} onHover={setHovered} />
        <ClusterLabels points={points} />
        <OrbitControls enableDamping dampingFactor={0.05} />
      </Canvas>
      {hovered && <HoverCard point={hovered} />}
    </div>
  );
}
