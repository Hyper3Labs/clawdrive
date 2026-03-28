// packages/core/src/storage/db.ts
import * as lancedb from "@lancedb/lancedb";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  Schema,
  Field,
  Float32,
  FixedSizeList,
  Utf8,
  Int32,
  Float64,
  List,
} from "apache-arrow";
import type { FileRecord } from "../types.js";
import { ensureUniqueFileName, getFileName } from "../display-names.js";

const VECTOR_DIM = 3072;
const SCHEMA_VERSION = 6;
const FILES_TABLE = "files";
const META_TABLE = "_meta";

/**
 * Apache Arrow schema for the files table.
 * Nullable fields use `true` for the nullable parameter.
 */
function buildFilesSchema(): Schema {
  return new Schema([
    new Field("id", new Utf8(), false),
    new Field(
      "vector",
      new FixedSizeList(VECTOR_DIM, new Field("item", new Float32())),
      false,
    ),
    new Field("original_name", new Utf8(), false),
    new Field("content_type", new Utf8(), false),
    new Field("file_path", new Utf8(), false),
    new Field("file_hash", new Utf8(), false),
    new Field("file_size", new Int32(), false),
    new Field("description", new Utf8(), true),
    new Field("transcript", new Utf8(), true),
    new Field("caption", new Utf8(), true),
    new Field("digest", new Utf8(), true),
    new Field("tags", new List(new Field("item", new Utf8())), false),
    new Field("taxonomy_path", new List(new Field("item", new Utf8())), false),
    new Field("embedding_model", new Utf8(), false),
    new Field("task_type", new Utf8(), false),
    new Field("searchable_text", new Utf8(), true),
    new Field("parent_id", new Utf8(), true),
    new Field("chunk_index", new Int32(), true),
    new Field("chunk_label", new Utf8(), true),
    new Field("status", new Utf8(), false),
    new Field("error_message", new Utf8(), true),
    new Field("deleted_at", new Float64(), true),
    new Field("created_at", new Float64(), false),
    new Field("updated_at", new Float64(), false),
    new Field("source_url", new Utf8(), true),
    new Field("display_name", new Utf8(), true),
  ]);
}

/**
 * Opens (or creates) a LanceDB database at the given path.
 * Also ensures the _meta table exists with a schema_version row.
 */
export async function createDatabase(
  dbPath: string,
): Promise<lancedb.Connection> {
  const db = await lancedb.connect(dbPath);

  // Ensure _meta table
  const tableNames = await db.tableNames();
  if (!tableNames.includes(META_TABLE)) {
    await db.createTable(META_TABLE, [{ schema_version: SCHEMA_VERSION }]);
  }

  return db;
}

/**
 * Returns the files table, creating it (empty) if it doesn't exist.
 * Migrates the schema if needed (e.g. adds display_name/transcript/caption/digest columns).
 * When wsPath is provided, migrates matching legacy sidecars into DB columns.
 */
export async function getFilesTable(
  db: lancedb.Connection,
  wsPath?: string,
): Promise<lancedb.Table> {
  const tableNames = await db.tableNames();
  if (tableNames.includes(FILES_TABLE)) {
    const table = await db.openTable(FILES_TABLE);
    await migrateFilesSchema(table, wsPath);
    return table;
  }
  return db.createEmptyTable(FILES_TABLE, buildFilesSchema());
}

/**
 * Add columns that are missing from older schemas.
 * Migrates sidecar display-names.json data into the new column when wsPath is given.
 */
async function migrateFilesSchema(table: lancedb.Table, wsPath?: string): Promise<void> {
  const schema = await table.schema();
  const fieldNames = new Set(schema.fields.map((f: { name: string }) => f.name));
  const missingDisplayName = !fieldNames.has("display_name");
  const missingTranscript = !fieldNames.has("transcript");
  const missingCaption = !fieldNames.has("caption");
  const missingDigest = !fieldNames.has("digest");

  if (missingDisplayName) {
    await table.addColumns([{ name: "display_name", valueSql: "cast(NULL as string)" }]);
  }

  if (missingTranscript) {
    await table.addColumns([{ name: "transcript", valueSql: "cast(NULL as string)" }]);
  }

  if (missingCaption) {
    await table.addColumns([{ name: "caption", valueSql: "cast(NULL as string)" }]);
  }

  if (missingDigest) {
    await table.addColumns([{ name: "digest", valueSql: "cast(NULL as string)" }]);
  }

  // Migrate legacy sidecars only when the corresponding DB column was just added.
  if (wsPath) {
    if (missingDisplayName) {
      await migrateSidecarDisplayNames(table, wsPath);
    }
    if (missingDigest) {
      await migrateSidecarDigests(table, wsPath);
    }

    await migrateUniqueVisibleNames(table);
  }
}

async function migrateUniqueVisibleNames(table: lancedb.Table): Promise<void> {
  const records = await queryFiles(table);
  const parents = records
    .filter((record) => record.parent_id === null)
    .sort((left, right) => {
      const createdDiff = left.created_at - right.created_at;
      if (createdDiff !== 0) {
        return createdDiff;
      }
      return left.id.localeCompare(right.id);
    });

  const usedNames = new Set<string>();

  for (const record of parents) {
    const currentName = getFileName(record);
    const uniqueName = ensureUniqueFileName(currentName, usedNames);
    usedNames.add(uniqueName);

    const nextDisplayName = uniqueName === record.original_name ? null : uniqueName;
    if (nextDisplayName === record.display_name) {
      continue;
    }

    await table.update({
      where: `id = '${record.id}'`,
      values: { display_name: nextDisplayName },
    });

    await table.update({
      where: `parent_id = '${record.id}'`,
      values: { display_name: nextDisplayName },
    });
  }
}

/**
 * One-time migration: read display-names.json sidecar and write values into DB rows.
 */
async function migrateSidecarDisplayNames(table: lancedb.Table, wsPath: string): Promise<void> {
  const sidecarPath = join(wsPath, "display-names.json");
  let names: Record<string, string>;
  try {
    const raw = await readFile(sidecarPath, "utf-8");
    names = JSON.parse(raw) as Record<string, string>;
  } catch {
    return; // No sidecar file or invalid — nothing to migrate
  }

  for (const [fileId, displayName] of Object.entries(names)) {
    if (displayName && typeof displayName === "string" && displayName.trim()) {
      try {
        await table.update({
          where: `id = '${fileId}'`,
          values: { display_name: displayName.trim() },
        });
      } catch {
        // Row may not exist; skip silently
      }
    }
  }
}

/**
 * One-time migration: read digests.json sidecar and write values into DB rows.
 */
async function migrateSidecarDigests(table: lancedb.Table, wsPath: string): Promise<void> {
  const sidecarPath = join(wsPath, "digests.json");
  let digests: Record<string, string>;
  try {
    const raw = await readFile(sidecarPath, "utf-8");
    digests = JSON.parse(raw) as Record<string, string>;
  } catch {
    return; // No sidecar file or invalid — nothing to migrate
  }

  for (const [fileId, digest] of Object.entries(digests)) {
    if (typeof digest !== "string") {
      continue;
    }

    const normalized = digest
      .trim()
      .replace(/\r\n/g, "\n");

    if (normalized) {
      try {
        await table.update({
          where: `id = '${fileId}'`,
          values: { digest: normalized },
        });
      } catch {
        // Row may not exist; skip silently
      }
    }
  }
}

/**
 * Serialise a FileRecord-like object for insertion into LanceDB.
 * Converts Float32Array vector to a plain number[] so LanceDB can handle it.
 */
function serializeRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const row = { ...record };
  // LanceDB expects plain arrays for vector columns when inserting via add()
  if (row.vector instanceof Float32Array) {
    row.vector = Array.from(row.vector);
  }
  return row;
}

/**
 * Insert a single file record into the files table.
 */
export async function insertFileRecord(
  table: lancedb.Table,
  record: Record<string, unknown>,
): Promise<void> {
  await table.add([serializeRecord(record)]);
}

/**
 * Convert a raw LanceDB row into a FileRecord.
 * Handles Arrow vector arrays -> Float32Array conversion.
 */
export function toFileRecord(raw: Record<string, unknown>): FileRecord {
  const row = { ...raw } as Record<string, unknown>;

  // Convert vector from plain array/typed array to Float32Array
  if (row.vector != null && !(row.vector instanceof Float32Array)) {
    row.vector = new Float32Array(row.vector as ArrayLike<number>);
  }

  // Convert Arrow List/Vector types to plain arrays for list fields
  for (const key of ["tags", "taxonomy_path"]) {
    const val = row[key];
    if (val != null && !Array.isArray(val) && typeof val === "object" && "toArray" in (val as object)) {
      row[key] = Array.from((val as { toArray(): unknown[] }).toArray());
    }
  }

  row.description = (row.description as string | null) ?? null;
  row.tldr = row.description;
  row.transcript = (row.transcript as string | null) ?? null;
  row.caption = (row.caption as string | null) ?? null;
  row.digest = (row.digest as string | null) ?? null;
  row.display_name = (row.display_name as string | null) ?? null;
  row.abstract = row.description;

  return row as unknown as FileRecord;
}

/**
 * Query all non-deleted file records from the table.
 */
export async function queryFiles(table: lancedb.Table): Promise<FileRecord[]> {
  const rows = await table
    .query()
    .where("deleted_at IS NULL")
    .limit(1000000)
    .toArray();

  return rows.map((r) => toFileRecord(r as Record<string, unknown>));
}
