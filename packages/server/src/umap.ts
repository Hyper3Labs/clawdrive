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
    const db = await createDatabase(join(wsPath, "db"));
    const table = await getFilesTable(db);
    const currentCount = await table.countRows();
    // Serve cache if file count hasn't changed by more than 10%
    if (Math.abs(currentCount - cached.fileCount) / Math.max(currentCount, 1) < 0.1) {
      return cached.points;
    }
  } catch {
    // Cache miss or read error — recompute
  }
  return recomputeProjections(wsPath);
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
      x: 0,
      y: 0,
      z: 0,
      fileName: parentFiles[0].original_name,
      contentType: parentFiles[0].content_type,
      tags: parentFiles[0].tags,
    }];
  }

  const vectors = parentFiles.map(f => Array.from(f.vector));
  const umap = new UMAP({ nComponents: 3, nNeighbors: Math.min(15, parentFiles.length - 1) });
  const embedding = umap.fit(vectors);

  const points: ProjectionPoint[] = parentFiles.map((f, i) => ({
    id: f.id,
    x: embedding[i][0],
    y: embedding[i][1],
    z: embedding[i][2],
    fileName: f.original_name,
    contentType: f.content_type,
    tags: f.tags,
  }));

  const cachePath = join(wsPath, "projections", "umap-cache.json");
  await mkdir(dirname(cachePath), { recursive: true });
  await writeFile(cachePath, JSON.stringify({ fileCount: parentFiles.length, points }));
  return points;
}
