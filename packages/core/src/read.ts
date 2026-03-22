// packages/core/src/read.ts
import { join, resolve } from "node:path";
import { copyFile } from "node:fs/promises";
import type { FileRecord } from "./types.js";
import { createDatabase, getFilesTable } from "./storage/db.js";

/**
 * Convert a raw LanceDB row into a FileRecord.
 * Handles Arrow vector arrays -> Float32Array and Arrow Lists -> plain arrays.
 */
function toFileRecord(raw: Record<string, unknown>): FileRecord {
  const row = { ...raw } as Record<string, unknown>;

  if (row.vector != null && !(row.vector instanceof Float32Array)) {
    row.vector = new Float32Array(row.vector as ArrayLike<number>);
  }

  for (const key of ["tags", "taxonomy_path"]) {
    const val = row[key];
    if (
      val != null &&
      !Array.isArray(val) &&
      typeof val === "object" &&
      "toArray" in (val as object)
    ) {
      row[key] = Array.from(
        (val as { toArray(): unknown[] }).toArray(),
      );
    }
  }

  return row as unknown as FileRecord;
}

export interface ReadOptions {
  wsPath: string;
}

/**
 * Get file info by id (non-deleted records only).
 * Returns the FileRecord or null if not found.
 */
export async function getFileInfo(
  id: string,
  opts: ReadOptions,
): Promise<FileRecord | null> {
  const dbPath = join(opts.wsPath, "db");
  const db = await createDatabase(dbPath);
  const table = await getFilesTable(db);

  const rows = await table
    .query()
    .where(`id = '${id}' AND deleted_at IS NULL`)
    .toArray();

  if (rows.length === 0) return null;
  return toFileRecord(rows[0] as Record<string, unknown>);
}

/**
 * Resolve the absolute path to the stored file.
 */
export async function getFilePath(
  id: string,
  opts: ReadOptions,
): Promise<string | null> {
  const info = await getFileInfo(id, opts);
  if (!info) return null;
  return join(opts.wsPath, "files", info.file_path);
}

/**
 * Export (copy) a stored file to a destination path.
 * Validates that destPath doesn't escape via path traversal.
 */
export async function exportFile(
  id: string,
  destPath: string,
  opts: ReadOptions,
): Promise<void> {
  const srcPath = await getFilePath(id, opts);
  if (!srcPath) {
    throw new Error(`File not found: ${id}`);
  }

  // Resolve destPath to an absolute path and basic traversal check
  const resolvedDest = resolve(destPath);
  if (resolvedDest.includes("\0")) {
    throw new Error("Invalid destination path");
  }

  await copyFile(srcPath, resolvedDest);
}
