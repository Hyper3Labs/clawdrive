import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useState, useRef } from "react";
import type { ProjectionPoint } from "../../types";
import { getModalityColor, getModalityLabel, MAP_THEME } from "../../theme";

const MAX_VISIBLE_LABELS = 26;

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
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 8px",
                borderRadius: 999,
                border: `1px solid ${MAP_THEME.border}`,
                background: "rgba(6, 16, 24, 0.78)",
                fontSize: 10,
                color:
                  p.id === highlightedId
                    ? MAP_THEME.text
                    : "rgba(230, 240, 247, 0.74)",
                whiteSpace: "nowrap",
                textShadow: "0 2px 4px rgba(0,0,0,0.6)",
                fontFamily: "'DM Sans', 'Avenir Next', 'Segoe UI', sans-serif",
                userSelect: "none",
                transition: "color 0.2s, border-color 0.2s",
                boxShadow:
                  p.id === highlightedId
                    ? `0 0 0 1px ${MAP_THEME.accentPrimary}55`
                    : "none",
              }}
            >
              <span
                style={{
                  fontSize: 9,
                  letterSpacing: 0.7,
                  fontWeight: 700,
                  color: getModalityColor(p.contentType),
                }}
              >
                {getModalityLabel(p.contentType)}
              </span>
              <span>{p.fileName}</span>
            </div>
          </Html>
        ))}
    </>
  );
}
