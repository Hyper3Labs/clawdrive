import { useRef, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ProjectionPoint } from "../../types";
import { getModalityColor, MAP_THEME } from "../../theme";
import { useVisualizationStore } from "./useVisualizationStore";

const DIM_OPACITY = 0.15;
const BG_COLOR = new THREE.Color(MAP_THEME.background);

function getColor(contentType: string): THREE.Color {
  return new THREE.Color(getModalityColor(contentType));
}

interface Props {
  points: ProjectionPoint[];
  onHover: (point: ProjectionPoint | null) => void;
  onSelect: (point: ProjectionPoint | null) => void;
  selectedId: string | null;
}

export function PointCloud({ points, onHover, onSelect, selectedId }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const selectedPoint = useMemo(
    () => points.find((point) => point.id === selectedId) ?? null,
    [points, selectedId],
  );

  const potFileIds = useVisualizationStore((s) => s.potFileIds);
  const selectedPotId = useVisualizationStore((s) => s.selectedPotId);
  const tmpColor = useMemo(() => new THREE.Color(), []);

  // Set initial positions
  useEffect(() => {
    if (!meshRef.current || points.length === 0) return;
    const mesh = meshRef.current;
    const dummy = new THREE.Object3D();

    points.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, getColor(p.contentType));
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [points]);

  // Apply dimming when pot is selected
  useFrame(() => {
    if (!meshRef.current || points.length === 0) return;
    if (!selectedPotId) return;

    const mesh = meshRef.current;

    points.forEach((p, i) => {
      const inPot = potFileIds.has(p.id);
      const baseColor = getColor(p.contentType);

      if (inPot) {
        mesh.setColorAt(i, baseColor);
      } else {
        tmpColor.copy(baseColor).lerp(BG_COLOR, 1 - DIM_OPACITY);
        mesh.setColorAt(i, tmpColor);
      }
    });

    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  // Reset colors when pot is deselected
  useEffect(() => {
    if (selectedPotId || !meshRef.current || points.length === 0) return;
    const mesh = meshRef.current;
    points.forEach((p, i) => {
      mesh.setColorAt(i, getColor(p.contentType));
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [selectedPotId, points]);

  return (
    <>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, Math.max(points.length, 1)]}
        onPointerOver={(e) => {
          e.stopPropagation();
          const idx = e.instanceId;
          if (idx !== undefined && points[idx]) onHover(points[idx]);
        }}
        onPointerOut={() => onHover(null)}
        onClick={(e) => {
          e.stopPropagation();
          const idx = e.instanceId;
          if (idx !== undefined && points[idx]) onSelect(points[idx]);
        }}
      >
        <sphereGeometry args={[0.35, 12, 12]} />
        <meshStandardMaterial
          emissive={MAP_THEME.accentPrimary}
          emissiveIntensity={0.18}
          metalness={0.05}
          roughness={0.32}
          transparent
        />
      </instancedMesh>

      {selectedPoint && (
        <group position={[selectedPoint.x, selectedPoint.y, selectedPoint.z]}>
          <mesh>
            <sphereGeometry args={[1.05, 16, 16]} />
            <meshBasicMaterial
              color={getModalityColor(selectedPoint.contentType)}
              transparent
              opacity={0.22}
            />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[1.45, 0.05, 10, 48]} />
            <meshBasicMaterial color={MAP_THEME.accentPrimary} transparent opacity={0.7} />
          </mesh>
        </group>
      )}
    </>
  );
}
