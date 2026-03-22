import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { store } from "../src/store.js";
import { createTestWorkspace } from "./helpers.js";
import { MockEmbeddingProvider } from "../src/embedding/mock.js";
import { createDatabase, getFilesTable, queryFiles } from "../src/storage/db.js";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

describe("store", () => {
  let ctx: Awaited<ReturnType<typeof createTestWorkspace>>;
  let embedder: MockEmbeddingProvider;

  beforeEach(async () => {
    ctx = await createTestWorkspace();
    embedder = new MockEmbeddingProvider(3072);
  });
  afterEach(async () => { await ctx.cleanup(); });

  it("stores a text file and returns result", async () => {
    const src = join(ctx.baseDir, "test.md");
    await writeFile(src, "# Hello\n\nThis is a test document.");
    const result = await store({
      sourcePath: src,
      tags: ["test"],
      description: "A test file",
    }, { wsPath: ctx.wsPath, embedder });
    expect(result.status).toBe("stored");
    expect(result.id).toBeDefined();
    expect(result.chunks).toBeGreaterThanOrEqual(1);
  });

  it("detects duplicates by hash", async () => {
    const src = join(ctx.baseDir, "test.md");
    await writeFile(src, "duplicate content");
    const r1 = await store({ sourcePath: src }, { wsPath: ctx.wsPath, embedder });
    const r2 = await store({ sourcePath: src }, { wsPath: ctx.wsPath, embedder });
    expect(r1.status).toBe("stored");
    expect(r2.status).toBe("duplicate");
    expect(r2.duplicateId).toBe(r1.id);
  });

  it("sets status to embedded on success", async () => {
    const src = join(ctx.baseDir, "test.txt");
    await writeFile(src, "content");
    await store({ sourcePath: src }, { wsPath: ctx.wsPath, embedder });
    const db = await createDatabase(join(ctx.wsPath, "db"));
    const table = await getFilesTable(db);
    const rows = await queryFiles(table);
    expect(rows[0].status).toBe("embedded");
  });

  it("stores tags and description", async () => {
    const src = join(ctx.baseDir, "tagged.md");
    await writeFile(src, "tagged content");
    await store({ sourcePath: src, tags: ["a", "b"], description: "desc" }, { wsPath: ctx.wsPath, embedder });
    const db = await createDatabase(join(ctx.wsPath, "db"));
    const table = await getFilesTable(db);
    const rows = await queryFiles(table);
    expect(rows[0].tags).toEqual(["a", "b"]);
    expect(rows[0].description).toBe("desc");
  });

  it("populates searchable_text for text files", async () => {
    const src = join(ctx.baseDir, "search.md");
    await writeFile(src, "This is searchable content for testing");
    await store({ sourcePath: src }, { wsPath: ctx.wsPath, embedder });
    const db = await createDatabase(join(ctx.wsPath, "db"));
    const table = await getFilesTable(db);
    const rows = await queryFiles(table);
    expect(rows[0].searchable_text).toContain("searchable content");
  });
});
