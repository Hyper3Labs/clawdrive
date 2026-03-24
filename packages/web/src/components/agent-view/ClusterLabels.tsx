import { Html } from "@react-three/drei";
import React, { useMemo } from "react";
import type { ProjectionPoint } from "../../types";
import { MAP_THEME } from "../../theme";
import { useVisualizationStore } from "./useVisualizationStore";

function kMeansClusters(points: ProjectionPoint[], k: number) {
  if (points.length < k) return [];

  let centroids = points.slice(0, k).map(p => ({ x: p.x, y: p.y, z: p.z }));
  const assignments = new Array(points.length).fill(0);

  for (let iter = 0; iter < 10; iter++) {
    points.forEach((p, i) => {
      let minDist = Infinity;
      centroids.forEach((c, j) => {
        const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2 + (p.z - c.z) ** 2;
        if (d < minDist) { minDist = d; assignments[i] = j; }
      });
    });
    centroids = centroids.map((_, j) => {
      const members = points.filter((_, i) => assignments[i] === j);
      if (members.length === 0) return centroids[j];
      return {
        x: members.reduce((s, p) => s + p.x, 0) / members.length,
        y: members.reduce((s, p) => s + p.y, 0) / members.length,
        z: members.reduce((s, p) => s + p.z, 0) / members.length,
      };
    });
  }

  return centroids.map((c, j) => {
    const members = points.filter((_, i) => assignments[i] === j);
    const words = members.flatMap(m => m.fileName.replace(/\.[^.]+$/, "").split(/[-_\s]+/));
    const freq: Record<string, number> = {};
    words.forEach(w => { if (w.length > 2) freq[w] = (freq[w] || 0) + 1; });
    const topWord = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] || "Cluster";
    return { ...c, label: topWord.charAt(0).toUpperCase() + topWord.slice(1) };
  });
}

const LABEL_STYLE: React.CSSProperties = {
  opacity: 0.65, fontSize: 11, textTransform: "uppercase",
  letterSpacing: 2, whiteSpace: "nowrap",
  pointerEvents: "none", userSelect: "none",
  padding: "2px 8px", borderRadius: 999,
  border: `1px solid ${MAP_THEME.border}`,
  background: "rgba(6, 16, 24, 0.66)",
  color: "rgba(230, 240, 247, 0.7)",
};

export function ClusterLabels({ points }: { points: ProjectionPoint[] }) {
  const clusters = useMemo(() => kMeansClusters(points, Math.min(5, points.length)), [points]);
  const clickedFileId = useVisualizationStore((s) => s.clickedFileId);

  // Hide labels when modal is open to prevent them rendering on top
  if (clickedFileId) return null;

  return (
    <>
      {clusters.map((c) => (
        <Html key={c.label} position={[c.x, c.y + 2, c.z]} center zIndexRange={[5, 0]}>
          <div style={LABEL_STYLE}>
            {c.label}
          </div>
        </Html>
      ))}
    </>
  );
}
