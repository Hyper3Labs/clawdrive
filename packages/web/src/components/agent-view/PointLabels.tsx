import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useState, useRef } from "react";
import type { ProjectionPoint } from "../../types";

const MAX_VISIBLE_LABELS = 12;

export function PointLabels({
  points,
  highlightedId,
}: {
  points: ProjectionPoint[];
  highlightedId: string | null;
}) {
  const { camera } = useThree();
  const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
  const frameCount = useRef(0);

  // Update visible labels every 10 frames (performance)
  useFrame(() => {
    frameCount.current++;
    if (frameCount.current % 10 !== 0) return;

    const camPos = camera.position;
    const distances = points.map((p) => ({
      id: p.id,
      dist: Math.sqrt(
        (p.x - camPos.x) ** 2 +
          (p.y - camPos.y) ** 2 +
          (p.z - camPos.z) ** 2,
      ),
    }));
    distances.sort((a, b) => a.dist - b.dist);
    const nearest = new Set(
      distances.slice(0, MAX_VISIBLE_LABELS).map((d) => d.id),
    );
    if (highlightedId) nearest.add(highlightedId);
    setVisibleIds(nearest);
  });

  return (
    <>
      {points
        .filter((p) => visibleIds.has(p.id))
        .map((p) => (
          <Html
            key={p.id}
            position={[p.x, p.y + 1.2, p.z]}
            center
            style={{ pointerEvents: "none" }}
          >
            <div
              style={{
                fontSize: 10,
                color:
                  p.id === highlightedId
                    ? "#00ff41"
                    : "rgba(255,255,255,0.6)",
                whiteSpace: "nowrap",
                textShadow:
                  p.id === highlightedId
                    ? "0 0 8px #00ff41"
                    : "0 0 4px rgba(0,0,0,0.8)",
                fontFamily: "'SF Mono', 'Fira Code', monospace",
                userSelect: "none",
                transition: "color 0.2s",
              }}
            >
              {p.fileName}
            </div>
          </Html>
        ))}
    </>
  );
}
