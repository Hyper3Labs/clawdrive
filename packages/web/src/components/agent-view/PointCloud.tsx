import { useRef, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ProjectionPoint } from "../../types";

// Create radial gradient sprite texture
function makePointSprite(): THREE.Texture {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

const TYPE_COLORS: Record<string, [number, number, number]> = {
  "application/pdf": [0.49, 0.83, 0.99], // #7dd3fc blue
  "image/": [0.53, 0.94, 0.68], // #86efac green
  "video/": [0.75, 0.52, 0.99], // #c084fc purple
  "audio/": [0.98, 0.75, 0.14], // #fbbf24 yellow
  "text/": [0.97, 0.53, 0.44], // #f87171 red
};

function getTypeColor(ct: string): [number, number, number] {
  for (const [prefix, color] of Object.entries(TYPE_COLORS)) {
    if (ct.startsWith(prefix)) return color;
  }
  return [0.89, 0.89, 0.93]; // default light gray
}

interface Props {
  points: ProjectionPoint[];
  onHover: (point: ProjectionPoint | null) => void;
  highlightedId: string | null;
}

export function PointCloud({ points, onHover, highlightedId }: Props) {
  const pointsRef = useRef<THREE.Points>(null);
  const highlightRef = useRef<THREE.Points>(null);
  const sprite = useMemo(() => makePointSprite(), []);

  // Build geometry
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(points.length * 3);
    const col = new Float32Array(points.length * 3);
    points.forEach((p, i) => {
      pos[i * 3] = p.x;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = p.z;
      const c = getTypeColor(p.contentType);
      col[i * 3] = c[0];
      col[i * 3 + 1] = c[1];
      col[i * 3 + 2] = c[2];
    });
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return geo;
  }, [points]);

  // Highlight geometry (single point, additive glow)
  const highlightGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(3), 3),
    );
    return geo;
  }, []);

  // Breathing animation + highlight pulse
  useFrame(({ clock }) => {
    if (pointsRef.current) {
      const mat = pointsRef.current.material as THREE.PointsMaterial;
      const t = clock.getElapsedTime();
      mat.size = 1.2 + 0.15 * Math.sin(t * 0.8);
    }
    if (highlightRef.current && highlightedId) {
      const mat = highlightRef.current.material as THREE.PointsMaterial;
      const t = clock.getElapsedTime();
      mat.size = 3.0 + 0.8 * Math.sin(t * 4);
      mat.opacity = 0.4 + 0.4 * Math.sin(t * 4 + 1.2);
    }
  });

  // Update highlight position
  useEffect(() => {
    if (!highlightRef.current) return;
    if (highlightedId) {
      const idx = points.findIndex((p) => p.id === highlightedId);
      if (idx >= 0) {
        const pos = highlightRef.current.geometry.attributes
          .position as THREE.BufferAttribute;
        pos.setXYZ(0, points[idx].x, points[idx].y, points[idx].z);
        pos.needsUpdate = true;
        highlightRef.current.visible = true;
      }
    } else {
      highlightRef.current.visible = false;
    }
  }, [highlightedId, points]);

  return (
    <>
      {/* Main points */}
      <points ref={pointsRef} geometry={geometry}>
        <pointsMaterial
          size={1.2}
          sizeAttenuation={true}
          vertexColors={true}
          map={sprite}
          transparent={true}
          alphaTest={0.1}
          depthWrite={true}
        />
      </points>
      {/* Highlight pulse (additive glow) */}
      <points
        ref={highlightRef}
        geometry={highlightGeo}
        visible={false}
        renderOrder={2}
      >
        <pointsMaterial
          size={3.0}
          map={sprite}
          transparent={true}
          opacity={0.5}
          color={0x00ff41}
          alphaTest={0.05}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </>
  );
}
