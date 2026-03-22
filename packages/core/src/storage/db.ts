// packages/core/src/storage/db.ts
import * as lancedb from "@lancedb/lancedb";
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

const VECTOR_DIM = 3072;
const SCHEMA_VERSION = 1;
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
 */
export async function getFilesTable(
  db: lancedb.Connection,
): Promise<lancedb.Table> {
  const tableNames = await db.tableNames();
  if (tableNames.includes(FILES_TABLE)) {
    return db.openTable(FILES_TABLE);
  }
  return db.createEmptyTable(FILES_TABLE, buildFilesSchema());
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
function toFileRecord(raw: Record<string, unknown>): FileRecord {
  const row = { ...raw } as Record<string, unknown>;

  // Convert vector from plain array/typed array to Float32Array
  if (row.vector != null && !(row.vector instanceof Float32Array)) {
    row.vector = new Float32Array(row.vector as ArrayLike<number>);
  }

  return row as unknown as FileRecord;
}

/**
 * Query all non-deleted file records from the table.
 */
export async function queryFiles(table: lancedb.Table): Promise<FileRecord[]> {
  const rows = await table
    .query()
    .where("deleted_at IS NULL")
    .toArray();

  return rows.map((r) => toFileRecord(r as Record<string, unknown>));
}
