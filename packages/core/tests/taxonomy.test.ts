import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { assignToTaxonomy, getTaxonomyTree } from "../src/taxonomy.js";
import { createDatabase, getFilesTable, insertFileRecord } from "../src/storage/db.js";
import { join } from "node:path";
import { createTestWorkspace } from "./helpers.js";

/**
 * Helper: insert a minimal parent file record so assignToTaxonomy can update its taxonomy_path.
 */
async function insertStubFile(
  wsPath: string,
  id: string,
  name: string,
  vector: Float32Array,
) {
  const dbPath = join(wsPath, "db");
  const db = await createDatabase(dbPath);
  const table = await getFilesTable(db);
  const now = Date.now();
  await insertFileRecord(table, {
    id,
    vector,
    original_name: name,
    content_type: "text/plain",
    file_path: `2026-03/${id}.md`,
    file_hash: `hash-${id}`,
    file_size: 100,
    description: null,
    tags: [],
    taxonomy_path: [],
    embedding_model: "mock",
    task_type: "RETRIEVAL_DOCUMENT",
    searchable_text: name,
    parent_id: null,
    chunk_index: null,
    chunk_label: null,
    status: "embedded",
    error_message: null,
    deleted_at: null,
    created_at: now,
    updated_at: now,
    source_url: null,
  });
}

describe("taxonomy", () => {
  let ctx: Awaited<ReturnType<typeof createTestWorkspace>>;
  beforeEach(async () => {
    ctx = await createTestWorkspace();
  });
  afterEach(async () => {
    await ctx.cleanup();
  });

  it("creates root node on first assignment", async () => {
    const vector = new Float32Array(3072).fill(0.1);
    await insertStubFile(ctx.wsPath, "file1", "test.md", vector);
    await assignToTaxonomy(vector, "file1", "test.md", {
      wsPath: ctx.wsPath,
    });
    const tree = await getTaxonomyTree({ wsPath: ctx.wsPath });
    expect(tree).toBeDefined();
    expect(tree!.itemCount).toBe(1);
    expect(tree!.label).toBe("All");
  });

  it("assigns multiple files to root", async () => {
    for (let i = 0; i < 3; i++) {
      const v = new Float32Array(3072).fill(0.1 * (i + 1));
      const id = `file${i}`;
      const name = `test${i}.md`;
      await insertStubFile(ctx.wsPath, id, name, v);
      await assignToTaxonomy(v, id, name, { wsPath: ctx.wsPath });
    }
    const tree = await getTaxonomyTree({ wsPath: ctx.wsPath });
    expect(tree).toBeDefined();
    expect(tree!.itemCount).toBe(3);
  });

  it("splits node when exceeding 8 items", async () => {
    // Create two distinct clusters of vectors
    for (let i = 0; i < 9; i++) {
      const v = new Float32Array(3072);
      if (i < 5) {
        // Cluster A: high values in first half
        for (let d = 0; d < 1536; d++) v[d] = 1.0;
        for (let d = 1536; d < 3072; d++) v[d] = 0.01;
      } else {
        // Cluster B: high values in second half
        for (let d = 0; d < 1536; d++) v[d] = 0.01;
        for (let d = 1536; d < 3072; d++) v[d] = 1.0;
      }
      // Add small per-file variation
      v[i % 3072] += 0.1;
      const id = `file${i}`;
      const name = `test${i}.md`;
      await insertStubFile(ctx.wsPath, id, name, v);
      await assignToTaxonomy(v, id, name, { wsPath: ctx.wsPath });
    }
    const tree = await getTaxonomyTree({ wsPath: ctx.wsPath });
    expect(tree).toBeDefined();
    expect(tree!.children).toBeDefined();
    expect(tree!.children!.length).toBe(2);
    // Root should have item_count 0 (it's now a branch)
    expect(tree!.itemCount).toBe(0);
    // Children should have non-zero item counts summing to 9
    const totalChildren =
      tree!.children![0].itemCount + tree!.children![1].itemCount;
    expect(totalChildren).toBe(9);
  });

  it("returns null when no taxonomy exists", async () => {
    const tree = await getTaxonomyTree({ wsPath: ctx.wsPath });
    expect(tree).toBeNull();
  });
});
