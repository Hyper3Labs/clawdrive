import { Html } from "@react-three/drei";
import { useMemo } from "react";
import type { ProjectionPoint } from "../../types";

interface ClusterCenter {
  x: number;
  y: number;
  z: number;
  label: string;
}

function kMeansClusters(
  points: ProjectionPoint[],
  k: number
): ClusterCenter[] {
  if (points.length < k) return [];

  // Pick k initial centroids from the first k points
  let centroids = points
    .slice(0, k)
    .map((p) => ({ x: p.x, y: p.y, z: p.z }));
  const assignments = new Array(points.length).fill(0);

  for (let iter = 0; iter < 10; iter++) {
    // Assign each point to nearest centroid
    points.forEach((p, i) => {
      let minDist = Infinity;
      centroids.forEach((c, j) => {
        const d =
          (p.x - c.x) ** 2 + (p.y - c.y) ** 2 + (p.z - c.z) ** 2;
        if (d < minDist) {
          minDist = d;
          assignments[i] = j;
        }
      });
    });
    // Recompute centroids
    centroids = centroids.map((_, j) => {
      const members = points.filter((__, i) => assignments[i] === j);
      if (members.length === 0) return centroids[j];
      return {
        x: members.reduce((s, p) => s + p.x, 0) / members.length,
        y: members.reduce((s, p) => s + p.y, 0) / members.length,
        z: members.reduce((s, p) => s + p.z, 0) / members.length,
      };
    });
  }

  // Generate labels from most common words in filenames
  return centroids.map((c, j) => {
    const members = points.filter((__, i) => assignments[i] === j);
    const words = members.flatMap((m) =>
      m.fileName.replace(/\.[^.]+$/, "").split(/[-_\s]+/)
    );
    const freq: Record<string, number> = {};
    words.forEach((w) => {
      if (w.length > 2) freq[w] = (freq[w] || 0) + 1;
    });
    const topWord =
      Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] ||
      "Cluster";
    return {
      ...c,
      label: topWord.charAt(0).toUpperCase() + topWord.slice(1),
    };
  });
}

export function ClusterLabels({ points }: { points: ProjectionPoint[] }) {
  const clusters = useMemo(
    () => kMeansClusters(points, Math.min(5, points.length)),
    [points]
  );

  return (
    <>
      {clusters.map((c, i) => (
        <Html key={i} position={[c.x, c.y + 2, c.z]} center>
          <div
            style={{
              opacity: 0.3,
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: 2,
              color: "#e4e4e7",
              whiteSpace: "nowrap",
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            {c.label}
          </div>
        </Html>
      ))}
    </>
  );
}
