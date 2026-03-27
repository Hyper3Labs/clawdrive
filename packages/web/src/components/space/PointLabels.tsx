import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import type { ProjectionPoint } from "../../types";
import { getModalityColor, getModalityLabel, MAP_THEME } from "../../theme";

const MAX_VISIBLE_LABELS = 14;
const MAX_LABEL_DISTANCE_SQ = 38 * 38;
const LABEL_UPDATE_INTERVAL = 0.33;

function arraysEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function PointLabels({
  points,
  highlightedId,
}: {
  points: ProjectionPoint[];
  highlightedId: string | null;
}) {
  const { camera } = useThree();
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const lastUpdateAt = useRef(0);
  const visibleIdSet = useMemo(() => new Set(visibleIds), [visibleIds]);

  useFrame((state) => {
    if (state.clock.elapsedTime - lastUpdateAt.current < LABEL_UPDATE_INTERVAL) return;
    lastUpdateAt.current = state.clock.elapsedTime;

    const camPos = camera.position;
    const distances = points.map((p) => ({
      id: p.id,
      distSq:
        (p.x - camPos.x) ** 2 +
        (p.y - camPos.y) ** 2 +
        (p.z - camPos.z) ** 2,
    }));
    const nextIds = distances
      .filter((entry) => entry.distSq <= MAX_LABEL_DISTANCE_SQ)
      .sort((a, b) => a.distSq - b.distSq)
      .slice(0, MAX_VISIBLE_LABELS)
      .map((entry) => entry.id);

    if (highlightedId && !nextIds.includes(highlightedId)) nextIds.unshift(highlightedId);

    if (!arraysEqual(visibleIds, nextIds)) {
      setVisibleIds(nextIds);
    }
  });

  return (
    <>
      {points
        .filter((p) => visibleIdSet.has(p.id))
        .map((p) => (
          <Html
            key={p.id}
            position={[p.x, p.y + 1.2, p.z]}
            center
            style={{ pointerEvents: "none" }}
            occlude
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
