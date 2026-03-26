import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatabase, getFilesTable, insertFileRecord, queryFiles } from "../../src/storage/db.js";
import { createTestWorkspace } from "../helpers.js";

describe("database", () => {
  let ctx: Awaited<ReturnType<typeof createTestWorkspace>>;
  beforeEach(async () => { ctx = await createTestWorkspace(); });
  afterEach(async () => { await ctx.cleanup(); });

  it("creates database and files table", async () => {
    const db = await createDatabase(ctx.dbPath);
    const table = await getFilesTable(db);
    expect(table).toBeDefined();
    const count = await table.countRows();
    expect(count).toBe(0);
  });

  it("inserts and retrieves a file record", async () => {
    const db = await createDatabase(ctx.dbPath);
    const table = await getFilesTable(db);
    const record = {
      id: "test-id-001",
      vector: new Float32Array(3072).fill(0.1),
      original_name: "test.txt",
      content_type: "text/plain",
      file_path: "2026-03/test-id-001.txt",
      file_hash: "abc123",
      file_size: 1024,
      description: null,
      digest: null,
      tags: ["test"],
      taxonomy_path: [],
      embedding_model: "gemini-embedding-2-preview",
      task_type: "RETRIEVAL_DOCUMENT",
      searchable_text: "test content",
      parent_id: null,
      chunk_index: null,
      chunk_label: null,
      status: "embedded",
      error_message: null,
      deleted_at: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      source_url: null,
      display_name: null,
    };
    await insertFileRecord(table, record);
    const rows = await queryFiles(table);
    expect(rows).toHaveLength(1);
    expect(rows[0].original_name).toBe("test.txt");
  });
});
