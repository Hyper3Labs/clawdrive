// packages/core/src/manage.ts
import { join } from "node:path";
import { readFile, appendFile, stat, readdir, unlink } from "node:fs/promises";
import type { FileRecord } from "./types.js";
import { createDatabase, getFilesTable, toFileRecord, insertFileRecord, queryFiles } from "./storage/db.js";
import { acquireLock } from "./lock.js";
import { normalizeCaption, normalizeTldr, normalizeTranscript } from "./metadata.js";
import { normalizeDigest } from "./digests.js";
import { ensureUniqueFileName, getFileName, normalizeDisplayName } from "./display-names.js";
import { loadConfig, resolveApiKey } from "./config.js";

export interface ManageOptions {
  wsPath: string;
}

async function allocateDisplayName(
  table: Awaited<ReturnType<typeof getFilesTable>>,
  desiredName: string,
  excludedId: string,
): Promise<string> {
  const usedNames = (await queryFiles(table))
    .filter((row) => row.parent_id === null && row.id !== excludedId)
    .map((row) => getFileName(row));

  return ensureUniqueFileName(desiredName, usedNames);
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
    const table = await getFilesTable(db, wsPath);
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
 * Update tags and/or short-summary-compatible metadata on a file record.
 */
export async function update(
  id: string,
  changes: { tags?: string[]; description?: string | null; tldr?: string | null; transcript?: string | null; caption?: string | null; digest?: string | null; displayName?: string | null; abstract?: string | null },
  opts: ManageOptions,
): Promise<void> {
  const { wsPath } = opts;
  const dbPath = join(wsPath, "db");
  const release = await acquireLock(wsPath);
  try {
    const db = await createDatabase(dbPath);
    const table = await getFilesTable(db, wsPath);
    const currentRows = await table.query().where(`id = '${id}' AND deleted_at IS NULL`).limit(1).toArray();
    if (currentRows.length === 0) {
      return;
    }

    const current = toFileRecord(currentRows[0] as Record<string, unknown>);

    const values: Record<string, string | number | string[] | null> = {
      updated_at: Date.now(),
    };

    if (changes.tags !== undefined) {
      values.tags = changes.tags;
    }
    if (changes.tldr !== undefined) {
      values.description = normalizeTldr(changes.tldr);
    } else if (changes.abstract !== undefined) {
      values.description = normalizeTldr(changes.abstract);
    } else if (changes.description !== undefined) {
      values.description = normalizeTldr(changes.description);
    }
    if (changes.displayName !== undefined) {
      const normalized = normalizeDisplayName(changes.displayName);
      const desiredName = normalized ?? current.original_name;
      const uniqueName = await allocateDisplayName(table, desiredName, id);
      values.display_name = uniqueName === current.original_name ? null : uniqueName;
    }
    if (changes.transcript !== undefined) {
      values.transcript = normalizeTranscript(changes.transcript);
    }
    if (changes.caption !== undefined) {
      values.caption = normalizeCaption(changes.caption);
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

    if (changes.digest !== undefined) {
      await table.update({
        where: `id = '${id}' AND deleted_at IS NULL`,
        values: {
          digest: normalizeDigest(changes.digest),
          updated_at: Date.now(),
        },
      });
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
  values: Record<string, string | number | string[] | null>,
): Promise<void> {
  const rows = await table.query().where(whereClause).limit(1_000_000).toArray();
  if (rows.length === 0) return;

  await table.delete(whereClause);

  for (const raw of rows) {
    const row = { ...(raw as Record<string, unknown>) };
    // Convert Arrow types to plain JS types for reinsertion
    if (row.vector != null && !Array.isArray(row.vector)) {
      row.vector = Array.from(row.vector as ArrayLike<number>);
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
    const table = await getFilesTable(db, wsPath);

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
export interface DoctorOptions extends ManageOptions {
  configPath?: string;
  envApiKey?: string;
}

export async function doctor(
  opts: DoctorOptions,
): Promise<{ healthy: boolean; issues: string[] }> {
  const { wsPath } = opts;
  const dbPath = join(wsPath, "db");
  const filesDir = join(wsPath, "files");
  const issues: string[] = [];

  // Check API key configuration
  if (opts.configPath) {
    const config = await loadConfig(opts.configPath);
    const apiKey = resolveApiKey(opts.envApiKey, config.gemini_api_key);
    if (!apiKey) {
      issues.push(
        'No Gemini API key configured. Set GEMINI_API_KEY or add gemini_api_key to ~/.clawdrive/config.json',
      );
    }
  }

  try {
    const db = await createDatabase(dbPath);
    const table = await getFilesTable(db, wsPath);

    // Check for pending rows
    const pendingRows = await table
      .query()
      .where("status = 'pending' AND deleted_at IS NULL")
      .toArray();
    if (pendingRows.length > 0) {
      issues.push(`${pendingRows.length} file(s) with status "pending"`);
    }

    // Check for rows whose content is stored but still missing embeddings.
    const unindexedRows = await table
      .query()
      .where("(status = 'stored' OR status = 'failed') AND deleted_at IS NULL AND error_message IS NOT NULL")
      .toArray();
    if (unindexedRows.length > 0) {
      issues.push(`${unindexedRows.length} stored file(s) missing embeddings`);
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
  contentType?: string;
  tags?: string[];
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
  const table = await getFilesTable(db, wsPath);

  // Fetch all non-deleted embedded files, then filter parents in JS
  // (LanceDB's IS NULL doesn't reliably match all null parent_id values)
  const allRows = await table
    .query()
    .where("deleted_at IS NULL AND status = 'embedded'")
    .limit(1000000)
    .toArray();

  // Convert and filter to parent rows only, sort by created_at desc
  let items = allRows
    .filter((r) => (r as Record<string, unknown>).parent_id === null)
    .map((r) => toFileRecord(r as Record<string, unknown>))
    .sort((a, b) => {
      const timeDiff = b.created_at - a.created_at;
      if (timeDiff !== 0) return timeDiff;
      return b.id > a.id ? 1 : b.id < a.id ? -1 : 0;
    });

  if (input.taxonomyPath && input.taxonomyPath.length > 0) {
    items = items.filter((item) =>
      input.taxonomyPath!.every((segment) => item.taxonomy_path.includes(segment)),
    );
  }

  if (input.contentType) {
    items = items.filter((f) => f.content_type.startsWith(input.contentType!));
  }
  if (input.tags && input.tags.length > 0) {
    items = items.filter((f) => input.tags!.every((t) => f.tags.includes(t)));
  }

  const total = items.length;

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

  return { items: pageItems, nextCursor, total };
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
