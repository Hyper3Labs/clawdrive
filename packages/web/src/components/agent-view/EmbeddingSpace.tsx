import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { PointCloud } from "./PointCloud";
import { PointLabels } from "./PointLabels";
import { HoverCard } from "./HoverCard";
import { useProjections } from "./useProjections";
import { useState, useRef, useEffect } from "react";
import * as THREE from "three";
import type { ProjectionPoint } from "../../types";

function SceneSetup() {
  const { scene } = useThree();
  useEffect(() => {
    scene.fog = new THREE.FogExp2(0x000000, 0.025);
  }, [scene]);
  return null;
}

// Raycaster component for hover detection
function RaycasterHelper({
  points,
  onHover,
}: {
  points: ProjectionPoint[];
  onHover: (p: ProjectionPoint | null) => void;
}) {
  const { camera, scene, gl } = useThree();
  const raycaster = useRef(new THREE.Raycaster());
  const mouse = useRef(new THREE.Vector2());

  useEffect(() => {
    raycaster.current.params.Points = { threshold: 0.8 };

    const handleMove = (e: MouseEvent) => {
      const rect = gl.domElement.getBoundingClientRect();
      mouse.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };
    gl.domElement.addEventListener("mousemove", handleMove);
    return () => gl.domElement.removeEventListener("mousemove", handleMove);
  }, [gl]);

  useFrame(() => {
    raycaster.current.setFromCamera(mouse.current, camera);

    // Find the main Points object in the scene (renderOrder 0, visible)
    let pointsObj: THREE.Points | null = null;
    scene.traverse((child) => {
      if (
        child instanceof THREE.Points &&
        child.visible &&
        child.renderOrder === 0
      ) {
        pointsObj = child;
      }
    });
    if (!pointsObj) return;

    const intersects = raycaster.current.intersectObject(pointsObj);
    if (intersects.length > 0 && intersects[0].index !== undefined) {
      onHover(points[intersects[0].index] ?? null);
    } else {
      onHover(null);
    }
  });

  return null;
}

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
        No files stored yet
      </div>
    );

  return (
    <div
      style={{ flex: 1, position: "relative", minHeight: 0, background: "#000" }}
    >
      <Canvas
        camera={{ position: [0, 0, 60], fov: 60, near: 0.1, far: 500 }}
      >
        <SceneSetup />
        <PointCloud
          points={points}
          onHover={setHovered}
          highlightedId={hovered?.id ?? null}
        />
        <PointLabels points={points} highlightedId={hovered?.id ?? null} />
        <RaycasterHelper points={points} onHover={setHovered} />
        <OrbitControls
          enableDamping
          dampingFactor={0.08}
          autoRotate
          autoRotateSpeed={0.3}
          zoomSpeed={0.8}
        />
      </Canvas>
      {hovered && <HoverCard point={hovered} />}
      {/* Color legend */}
      <div
        style={{
          position: "absolute",
          bottom: 16,
          left: 16,
          display: "flex",
          gap: 12,
          fontSize: 11,
          opacity: 0.5,
        }}
      >
        <span>
          <span style={{ color: "#7dd3fc" }}>&#9679;</span> PDF
        </span>
        <span>
          <span style={{ color: "#86efac" }}>&#9679;</span> Image
        </span>
        <span>
          <span style={{ color: "#c084fc" }}>&#9679;</span> Video
        </span>
        <span>
          <span style={{ color: "#fbbf24" }}>&#9679;</span> Audio
        </span>
        <span>
          <span style={{ color: "#f87171" }}>&#9679;</span> Text
        </span>
      </div>
    </div>
  );
}
