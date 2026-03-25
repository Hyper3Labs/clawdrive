// packages/core/src/read.ts
import { join, resolve } from "node:path";
import { copyFile } from "node:fs/promises";
import type { FileRecord } from "./types.js";
import { createDatabase, getFilesTable, toFileRecord } from "./storage/db.js";
import { getDigest } from "./digests.js";

export interface ReadOptions {
  wsPath: string;
  includeDigest?: boolean;
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

  const record = toFileRecord(rows[0] as Record<string, unknown>);
  if (!opts.includeDigest) {
    return record;
  }

  return {
    ...record,
    digest: await getDigest(record.id, { wsPath: opts.wsPath }),
  };
}

/**
 * Resolve the absolute path to the stored file.
 */
export async function getFilePath(
  id: string,
  opts: ReadOptions,
): Promise<string | null> {
  const info = await getFileInfo(id, { ...opts, includeDigest: false });
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
