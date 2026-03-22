import { UMAP } from "umap-js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createDatabase, getFilesTable, queryFiles } from "@clawdrive/core";

export interface ProjectionPoint {
  id: string;
  x: number;
  y: number;
  z: number;
  fileName: string;
  contentType: string;
  tags: string[];
}

export async function getProjections(wsPath: string): Promise<ProjectionPoint[]> {
  const cachePath = join(wsPath, "projections", "umap-cache.json");
  try {
    const cached = JSON.parse(await readFile(cachePath, "utf-8"));
    // Count parent files only (same as what we cache)
    const db = await createDatabase(join(wsPath, "db"));
    const table = await getFilesTable(db);
    const allFiles = await queryFiles(table);
    const parentCount = allFiles.filter(f => f.parent_id === null).length;
    // Serve cache if parent file count hasn't changed by more than 10%
    if (Math.abs(parentCount - cached.fileCount) / Math.max(parentCount, 1) < 0.1) {
      return cached.points;
    }
  } catch {
    // Cache miss or read error — recompute
  }
  return recomputeProjections(wsPath);
}

// Seeded random number generator for deterministic UMAP
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

export async function recomputeProjections(wsPath: string): Promise<ProjectionPoint[]> {
  const db = await createDatabase(join(wsPath, "db"));
  const table = await getFilesTable(db);
  const files = await queryFiles(table);

  // Filter to parent rows only (no chunks) for cleaner visualization
  const parentFiles = files.filter(f => f.parent_id === null);

  if (parentFiles.length === 0) return [];
  if (parentFiles.length === 1) {
    return [{
      id: parentFiles[0].id,
      x: 0, y: 0, z: 0,
      fileName: parentFiles[0].original_name,
      contentType: parentFiles[0].content_type,
      tags: parentFiles[0].tags,
    }];
  }

  const vectors = parentFiles.map(f => Array.from(f.vector));
  const umap = new UMAP({
    nComponents: 3,
    nNeighbors: Math.min(15, parentFiles.length - 1),
    random: seededRandom(42), // deterministic seed
  });
  const embedding = umap.fit(vectors);

  // Normalize: center at origin, scale to [-20, 20] range
  const xs = embedding.map(e => e[0]);
  const ys = embedding.map(e => e[1]);
  const zs = embedding.map(e => e[2]);
  const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const cy = ys.reduce((a, b) => a + b, 0) / ys.length;
  const cz = zs.reduce((a, b) => a + b, 0) / zs.length;
  const maxRange = Math.max(
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
    Math.max(...zs) - Math.min(...zs),
    0.001
  );
  const scale = 40 / maxRange;

  const points: ProjectionPoint[] = parentFiles.map((f, i) => ({
    id: f.id,
    x: (embedding[i][0] - cx) * scale,
    y: (embedding[i][1] - cy) * scale,
    z: (embedding[i][2] - cz) * scale,
    fileName: f.original_name,
    contentType: f.content_type,
    tags: f.tags,
  }));

  const cachePath = join(wsPath, "projections", "umap-cache.json");
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify({ fileCount: parentFiles.length, points }));
  return points;
}
