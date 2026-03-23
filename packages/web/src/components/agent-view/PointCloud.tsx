import { useRef, useEffect, useMemo } from "react";
import * as THREE from "three";
import type { ProjectionPoint } from "../../types";
import { getModalityColor, MAP_THEME } from "../../theme";

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
