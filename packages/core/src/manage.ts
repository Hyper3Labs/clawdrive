// packages/core/src/manage.ts
import { join } from "node:path";
import { readFile, appendFile, stat, readdir, unlink } from "node:fs/promises";
import type { FileRecord } from "./types.js";
import { createDatabase, getFilesTable, toFileRecord, insertFileRecord } from "./storage/db.js";
import { acquireLock } from "./lock.js";

export interface ManageOptions {
  wsPath: string;
}

/**
 * Soft-delete a file by setting deleted_at on the parent row and all child chunks.
 */
export async function remove(
  id: string,
  opts: ManageOptions,
): Promise<void> {
  const { wsPath } = opts;
  const dbPath = join(wsPath, "db");
  const release = await acquireLock(wsPath);
  try {
    const db = await createDatabase(dbPath);
    const table = await getFilesTable(db);
    const now = Date.now();

    // Soft-delete the parent row
    await table.update({
      where: `id = '${id}'`,
      values: { deleted_at: now, updated_at: now },
    });

    // Soft-delete all child chunks with this parent_id
    await table.update({
      where: `parent_id = '${id}'`,
      values: { deleted_at: now, updated_at: now },
    });
  } finally {
    await release();
  }
}

/**
 * Update tags and/or description on a file record.
 */
export async function update(
  id: string,
  changes: { tags?: string[]; description?: string },
  opts: ManageOptions,
): Promise<void> {
  const { wsPath } = opts;
  const dbPath = join(wsPath, "db");
  const release = await acquireLock(wsPath);
  try {
    const db = await createDatabase(dbPath);
    const table = await getFilesTable(db);

    const values: Record<string, string | number | string[]> = {
      updated_at: Date.now(),
    };

    if (changes.tags !== undefined) {
      values.tags = changes.tags;
    }
    if (changes.description !== undefined) {
      values.description = changes.description;
    }

    // LanceDB table.update() silently fails when updating List<Utf8> columns
    // (both empty and non-empty arrays). Always use the delete+re-insert workaround
    // when tags are being changed.
    if (changes.tags !== undefined) {
      await updateRowsWithEmptyList(table, `id = '${id}' AND deleted_at IS NULL`, values);
      await updateRowsWithEmptyList(table, `parent_id = '${id}' AND deleted_at IS NULL`, values);
    } else {
      await table.update({
        where: `id = '${id}' AND deleted_at IS NULL`,
        values,
      });

      const children = await table
        .query()
        .where(`parent_id = '${id}' AND deleted_at IS NULL`)
        .limit(1)
        .toArray();
      if (children.length > 0) {
        await table.update({
          where: `parent_id = '${id}' AND deleted_at IS NULL`,
          values,
        });
      }
    }
  } finally {
    await release();
  }
}

/**
 * Workaround for LanceDB inability to update List columns to empty arrays.
 * Reads matching rows, deletes them, applies changes, and re-inserts them.
 */
async function updateRowsWithEmptyList(
  table: Awaited<ReturnType<typeof getFilesTable>>,
  whereClause: string,
  values: Record<string, string | number | string[]>,
): Promise<void> {
  const rows = await table.query().where(whereClause).limit(1_000_000).toArray();
  if (rows.length === 0) return;

  await table.delete(whereClause);

  for (const raw of rows) {
    const row = { ...(raw as Record<string, unknown>) };
    // Convert Arrow types to plain JS types for reinsertion
    if (row.vector != null && !(row.vector instanceof Float32Array) && !(row.vector instanceof Array)) {
      row.vector = Array.from(row.vector as ArrayLike<number>);
    }
    if (row.vector instanceof Float32Array) {
      row.vector = Array.from(row.vector);
    }
    for (const key of ["tags", "taxonomy_path"]) {
      const val = row[key];
      if (val != null && !Array.isArray(val) && typeof val === "object" && "toArray" in (val as object)) {
        row[key] = Array.from((val as { toArray(): unknown[] }).toArray());
      }
    }
    // Apply the updated values
    for (const [k, v] of Object.entries(values)) {
      row[k] = v;
    }
    await insertFileRecord(table, row);
  }
}

/**
 * Garbage collect: permanently remove soft-deleted rows and their disk files.
 */
export async function gc(
  opts: ManageOptions,
): Promise<{ deletedRows: number; freedBytes: number }> {
  const { wsPath } = opts;
  const dbPath = join(wsPath, "db");
  const filesDir = join(wsPath, "files");
  const release = await acquireLock(wsPath);
  try {
    const db = await createDatabase(dbPath);
    const table = await getFilesTable(db);

    // Find all soft-deleted rows
    const deletedRows = await table
      .query()
      .where("deleted_at IS NOT NULL")
      .toArray();

    if (deletedRows.length === 0) {
      return { deletedRows: 0, freedBytes: 0 };
    }

    // Collect unique file paths and try to remove their disk files
    const seenPaths = new Set<string>();
    let freedBytes = 0;

    for (const row of deletedRows) {
      const filePath = (row as Record<string, unknown>).file_path as string;
      if (filePath && !seenPaths.has(filePath)) {
        seenPaths.add(filePath);
        const fullPath = join(filesDir, filePath);
        try {
          const fileStat = await stat(fullPath);
          freedBytes += fileStat.size;
          await unlink(fullPath);
        } catch {
          // File may already be gone
        }
      }
    }

    // Delete the rows permanently from LanceDB
    await table.delete(`deleted_at IS NOT NULL`);

    // Try to optimize the table if the method is available
    try {
      await (table as unknown as { optimize: () => Promise<void> }).optimize();
    } catch {
      // optimize may not be available
    }

    return { deletedRows: deletedRows.length, freedBytes };
  } finally {
    await release();
  }
}

/**
 * Health check: report issues with the workspace.
 */
export async function doctor(
  opts: ManageOptions,
): Promise<{ healthy: boolean; issues: string[] }> {
  const { wsPath } = opts;
  const dbPath = join(wsPath, "db");
  const filesDir = join(wsPath, "files");
  const issues: string[] = [];

  try {
    const db = await createDatabase(dbPath);
    const table = await getFilesTable(db);

    // Check for pending rows
    const pendingRows = await table
      .query()
      .where("status = 'pending' AND deleted_at IS NULL")
      .toArray();
    if (pendingRows.length > 0) {
      issues.push(`${pendingRows.length} file(s) with status "pending"`);
    }

    // Check for failed rows
    const failedRows = await table
      .query()
      .where("status = 'failed' AND deleted_at IS NULL")
      .toArray();
    if (failedRows.length > 0) {
      issues.push(`${failedRows.length} file(s) with status "failed"`);
    }

    // Check for orphaned files on disk not in DB
    const allRows = await table.query().where("deleted_at IS NULL").limit(1000000).toArray();
    const dbFilePaths = new Set<string>();
    for (const row of allRows) {
      const fp = (row as Record<string, unknown>).file_path as string;
      if (fp) dbFilePaths.add(fp);
    }

    // Walk the files directory for orphans
    try {
      const subdirs = await readdir(filesDir);
      for (const subdir of subdirs) {
        const subdirPath = join(filesDir, subdir);
        try {
          const subdirStat = await stat(subdirPath);
          if (!subdirStat.isDirectory()) continue;
          const files = await readdir(subdirPath);
          for (const file of files) {
            const relativePath = join(subdir, file);
            if (!dbFilePaths.has(relativePath)) {
              issues.push(`Orphaned file: ${relativePath}`);
            }
          }
        } catch {
          // skip non-directories
        }
      }
    } catch {
      // files dir may not exist yet
    }
  } catch (err) {
    issues.push(`Database error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    healthy: issues.length === 0,
    issues,
  };
}

export interface ListFilesInput {
  limit?: number;
  cursor?: string;
  taxonomyPath?: string[];
}

export interface ListFilesResult {
  items: FileRecord[];
  nextCursor?: string;
  total: number;
}

/**
 * List files with cursor-based pagination.
 * Files are ordered by created_at descending.
 * Cursor is the id of the last item; subsequent pages use WHERE created_at < cursor_item.created_at.
 */
export async function listFiles(
  input: ListFilesInput,
  opts: ManageOptions,
): Promise<ListFilesResult> {
  const { wsPath } = opts;
  const dbPath = join(wsPath, "db");
  const limit = input.limit ?? 20;

  const db = await createDatabase(dbPath);
  const table = await getFilesTable(db);

  // Build filters — count unique files, not chunks
  const filters: string[] = [
    "deleted_at IS NULL",
    "parent_id IS NULL",  // Only parent rows, not chunks
  ];

  const whereClause = filters.join(" AND ");

  // Fetch all matching rows (LanceDB defaults to 10 without explicit limit)
  const allRows = await table
    .query()
    .where(whereClause)
    .limit(1000000)
    .toArray();

  // Convert and sort by created_at desc, then id desc for stable ordering
  let items = allRows
    .map((r) => toFileRecord(r as Record<string, unknown>))
    .sort((a, b) => {
      const timeDiff = b.created_at - a.created_at;
      if (timeDiff !== 0) return timeDiff;
      return b.id > a.id ? 1 : b.id < a.id ? -1 : 0;
    });

  // Apply cursor: skip items until we pass the cursor id
  if (input.cursor) {
    const cursorIdx = items.findIndex((item) => item.id === input.cursor);
    if (cursorIdx >= 0) {
      items = items.slice(cursorIdx + 1);
    }
  }

  // Apply limit and determine if there's a next page
  const hasMore = items.length > limit;
  const pageItems = items.slice(0, limit);
  const nextCursor = hasMore ? pageItems[pageItems.length - 1]?.id : undefined;

  return { items: pageItems, nextCursor, total: allRows.length };
}

export interface UsageEntry {
  timestamp: number;
  model: string;
  tokensUsed: number;
  operation: string;
}

export interface UsageSummary {
  totalTokens: number;
  estimatedCost: number;
  entries: number;
}

/**
 * Log a usage entry to usage.jsonl.
 */
export async function logUsage(
  wsPath: string,
  entry: UsageEntry,
): Promise<void> {
  const usagePath = join(wsPath, "usage.jsonl");
  await appendFile(usagePath, JSON.stringify(entry) + "\n");
}

/**
 * Read and aggregate usage.jsonl. Returns total tokens and estimated cost.
 */
export async function getUsage(wsPath: string): Promise<UsageSummary> {
  const usagePath = join(wsPath, "usage.jsonl");

  let content: string;
  try {
    content = await readFile(usagePath, "utf-8");
  } catch {
    return { totalTokens: 0, estimatedCost: 0, entries: 0 };
  }

  const lines = content.trim().split("\n").filter(Boolean);
  let totalTokens = 0;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as UsageEntry;
      totalTokens += entry.tokensUsed ?? 0;
    } catch {
      // skip malformed lines
    }
  }

  // Rough cost estimate: $0.01 per 1000 tokens (placeholder rate)
  const estimatedCost = (totalTokens / 1000) * 0.01;

  return { totalTokens, estimatedCost, entries: lines.length };
}
