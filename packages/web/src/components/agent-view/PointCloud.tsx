import { useRef, useMemo } from "react";
import * as THREE from "three";
import type { ProjectionPoint } from "../../types";

const COLORS: Record<string, string> = {
  "application/pdf": "#7dd3fc",
  "image/": "#86efac",
  "video/": "#c084fc",
  "audio/": "#fbbf24",
  "text/": "#f87171",
};

function getColor(contentType: string): THREE.Color {
  for (const [prefix, hex] of Object.entries(COLORS)) {
    if (contentType.startsWith(prefix)) return new THREE.Color(hex);
  }
  return new THREE.Color("#e4e4e7");
}

interface Props {
  points: ProjectionPoint[];
  onHover: (point: ProjectionPoint | null) => void;
}

export function PointCloud({ points, onHover }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  useMemo(() => {
    if (!meshRef.current) return;
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
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, points.length]}
      onPointerOver={(e) => {
        e.stopPropagation();
        const idx = e.instanceId;
        if (idx !== undefined && points[idx]) onHover(points[idx]);
      }}
      onPointerOut={() => onHover(null)}
    >
      <sphereGeometry args={[0.8, 16, 16]} />
      <meshStandardMaterial emissive="#ffffff" emissiveIntensity={0.3} />
    </instancedMesh>
  );
}
