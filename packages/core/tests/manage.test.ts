import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { remove, update, gc, doctor, listFiles } from "../src/manage.js";
import { store } from "../src/store.js";
import { search } from "../src/search.js";
import { getFileInfo } from "../src/read.js";
import { createTestWorkspace } from "./helpers.js";
import { MockEmbeddingProvider } from "../src/embedding/mock.js";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

describe("manage", () => {
  let ctx: Awaited<ReturnType<typeof createTestWorkspace>>;
  let embedder: MockEmbeddingProvider;

  beforeEach(async () => {
    ctx = await createTestWorkspace();
    embedder = new MockEmbeddingProvider(3072);
  });
  afterEach(async () => { await ctx.cleanup(); });

  it("soft-deletes a file", async () => {
    const src = join(ctx.baseDir, "test.md");
    await writeFile(src, "content to delete");
    const r = await store({ sourcePath: src }, { wsPath: ctx.wsPath, embedder });
    await remove(r.id, { wsPath: ctx.wsPath });
    const results = await search({ query: "content", limit: 10 }, { wsPath: ctx.wsPath, embedder });
    expect(results.find(r2 => r2.id === r.id)).toBeUndefined();
  });

  it("updates tags and description", async () => {
    const src = join(ctx.baseDir, "test.md");
    await writeFile(src, "content to update");
    const r = await store({ sourcePath: src }, { wsPath: ctx.wsPath, embedder });
    await update(r.id, { tags: ["new-tag"], description: "updated desc" }, { wsPath: ctx.wsPath });
    const info = await getFileInfo(r.id, { wsPath: ctx.wsPath });
    expect(info!.tags).toContain("new-tag");
    expect(info!.description).toBe("updated desc");
  });

  it("lists files with pagination", async () => {
    const src1 = join(ctx.baseDir, "a.md");
    const src2 = join(ctx.baseDir, "b.md");
    const src3 = join(ctx.baseDir, "c.md");
    await writeFile(src1, "first file");
    await writeFile(src2, "second file");
    await writeFile(src3, "third file");
    await store({ sourcePath: src1 }, { wsPath: ctx.wsPath, embedder });
    await store({ sourcePath: src2 }, { wsPath: ctx.wsPath, embedder });
    await store({ sourcePath: src3 }, { wsPath: ctx.wsPath, embedder });

    const page1 = await listFiles({ limit: 2 }, { wsPath: ctx.wsPath });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBeDefined();

    const page2 = await listFiles({ limit: 2, cursor: page1.nextCursor }, { wsPath: ctx.wsPath });
    expect(page2.items).toHaveLength(1);
    expect(page2.nextCursor).toBeUndefined();
  });

  it("gc permanently removes soft-deleted files", async () => {
    const src = join(ctx.baseDir, "test.md");
    await writeFile(src, "content to gc");
    const r = await store({ sourcePath: src }, { wsPath: ctx.wsPath, embedder });
    await remove(r.id, { wsPath: ctx.wsPath });
    const gcResult = await gc({ wsPath: ctx.wsPath });
    expect(gcResult.deletedRows).toBeGreaterThanOrEqual(1);
  });

  it("doctor reports health status", async () => {
    const result = await doctor({ wsPath: ctx.wsPath });
    expect(result.healthy).toBe(true);
    expect(result.issues).toEqual([]);
  });
});
