import { useRef, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ProjectionPoint } from "../../types";
import { getModalityColor, MAP_THEME } from "../../theme";
import { useVisualizationStore } from "./useVisualizationStore";
import { useClickedPoint, useHoveredPoint } from "./useVisualizationHooks";

const DIM_FACTOR = 0.96; // nearly invisible
const BG_COLOR = new THREE.Color(MAP_THEME.raw.background);
const POT_HIGHLIGHT_COLOR = new THREE.Color("#FFEB3B"); // bright yellow for pot members

interface Props {
  points: ProjectionPoint[];
}

export function PointCloud({ points }: Props) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const selectedPoint = useClickedPoint(points);
  const hoveredPoint = useHoveredPoint(points);
  const clickedFileId = useVisualizationStore((s) => s.clickedFileId);
  const hoverFile = useVisualizationStore((s) => s.hoverFile);
  const clickFile = useVisualizationStore((s) => s.clickFile);

  const potFileIds = useVisualizationStore((s) => s.potFileIds);
  const selectedPotId = useVisualizationStore((s) => s.selectedPotId);
  const tmpColor = useMemo(() => new THREE.Color(), []);
  const prevPotIdRef = useRef<string | null>(null);
  const prevPotFileIdsRef = useRef<Set<string>>(new Set());

  // Cache colors by content type to avoid allocating THREE.Color every frame
  const colorMap = useMemo(() => {
    const map = new Map<string, THREE.Color>();
    for (const p of points) {
      if (!map.has(p.contentType)) {
        map.set(p.contentType, new THREE.Color(getModalityColor(p.contentType)));
      }
    }
    return map;
  }, [points]);

  // Set initial positions and colors
  useEffect(() => {
    if (!meshRef.current || points.length === 0) return;
    const mesh = meshRef.current;
    const dummy = new THREE.Object3D();

    points.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, colorMap.get(p.contentType)!);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [points, colorMap]);

  // Apply dimming only when pot selection or membership changes
  useFrame(() => {
    if (!meshRef.current || points.length === 0) return;
    if (!selectedPotId) return;

    // Skip if nothing changed since last frame
    if (prevPotIdRef.current === selectedPotId && prevPotFileIdsRef.current === potFileIds) return;
    prevPotIdRef.current = selectedPotId;
    prevPotFileIdsRef.current = potFileIds;

    const mesh = meshRef.current;

    points.forEach((p, i) => {
      const inPot = potFileIds.has(p.id);
      const baseColor = colorMap.get(p.contentType)!;

      if (inPot) {
        mesh.setColorAt(i, POT_HIGHLIGHT_COLOR);
      } else {
        // Heavily fade non-pot points toward background
        tmpColor.copy(baseColor).lerp(BG_COLOR, DIM_FACTOR);
        mesh.setColorAt(i, tmpColor);
      }
    });

    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  // Reset colors when pot is deselected
  useEffect(() => {
    if (selectedPotId || !meshRef.current || points.length === 0) return;
    prevPotIdRef.current = null;
    prevPotFileIdsRef.current = new Set();
    const mesh = meshRef.current;
    points.forEach((p, i) => {
      mesh.setColorAt(i, colorMap.get(p.contentType)!);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [selectedPotId, points, colorMap]);

  const hoverGlowColor = hoveredPoint ? colorMap.get(hoveredPoint.contentType) : undefined;
  const selectGlowColor = selectedPoint ? colorMap.get(selectedPoint.contentType) : undefined;

  return (
    <>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, Math.max(points.length, 1)]}
        onPointerOver={(e) => {
          e.stopPropagation();
          const idx = e.instanceId;
          if (idx !== undefined && points[idx]) hoverFile(points[idx].id);
        }}
        onClick={(e) => {
          e.stopPropagation();
          const idx = e.instanceId;
          if (idx !== undefined && points[idx]) clickFile(points[idx].id);
        }}
      >
        <sphereGeometry args={[0.35, 12, 12]} />
        <meshBasicMaterial />
      </instancedMesh>

      {hoveredPoint && hoveredPoint.id !== clickedFileId && (
        <group position={[hoveredPoint.x, hoveredPoint.y, hoveredPoint.z]} raycast={() => null}>
          <mesh raycast={() => null}>
            <sphereGeometry args={[0.55, 16, 16]} />
            <meshStandardMaterial
              color={hoverGlowColor}
              emissive={hoverGlowColor}
              emissiveIntensity={0.6}
              transparent
              opacity={0.25}
            />
          </mesh>
        </group>
      )}

      {selectedPoint && (
        <group position={[selectedPoint.x, selectedPoint.y, selectedPoint.z]} raycast={() => null}>
          <mesh raycast={() => null}>
            <sphereGeometry args={[0.6, 16, 16]} />
            <meshStandardMaterial
              color={selectGlowColor}
              emissive={selectGlowColor}
              emissiveIntensity={0.8}
              transparent
              opacity={0.3}
            />
          </mesh>
        </group>
      )}
    </>
  );
}
