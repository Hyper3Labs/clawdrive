import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { remove, update, gc, doctor, listFiles } from "../src/manage.js";
import { store } from "../src/store.js";
import { search } from "../src/search.js";
import { getFileInfo } from "../src/read.js";
import { createDatabase, getFilesTable, insertFileRecord } from "../src/storage/db.js";
import { createTestWorkspace, writeSilentWav, writeTinyPng } from "./helpers.js";
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

  it("updates tldr using the tldr field", async () => {
    const src = join(ctx.baseDir, "abstract.md");
    await writeFile(src, "content to summarize");
    const r = await store({ sourcePath: src }, { wsPath: ctx.wsPath, embedder });
    await update(r.id, { tldr: "Short TL;DR for quick relevance checks." }, { wsPath: ctx.wsPath });
    const info = await getFileInfo(r.id, { wsPath: ctx.wsPath });
    expect(info!.tldr).toBe("Short TL;DR for quick relevance checks.");
    expect(info!.description).toBe("Short TL;DR for quick relevance checks.");
  });

  it("updates digest without changing the stored tldr", async () => {
    const src = join(ctx.baseDir, "digest-update.md");
    await writeFile(src, "content to orient");
    const r = await store({ sourcePath: src, tldr: "Short summary." }, { wsPath: ctx.wsPath, embedder });

    await update(
      r.id,
      {
        digest: "# Digest\n\nOpening paragraph.\n\n## Quick Navigation\n- One\n\n## Detailed Description\nMore detail.",
      },
      { wsPath: ctx.wsPath },
    );

    const info = await getFileInfo(r.id, { wsPath: ctx.wsPath, includeDigest: true });
    expect(info!.tldr).toBe("Short summary.");
    expect(info!.digest).toContain("## Detailed Description");
  });

  it("updates transcript without changing the stored tldr", async () => {
    const src = join(ctx.baseDir, "meeting.wav");
    await writeSilentWav(src);
    const r = await store({ sourcePath: src, originalName: "meeting.wav", tldr: "Call recording." }, { wsPath: ctx.wsPath, embedder });

    await update(r.id, { transcript: "Speaker 1: We should renew the contract next week." }, { wsPath: ctx.wsPath });

    const info = await getFileInfo(r.id, { wsPath: ctx.wsPath, includeTranscript: true });
    expect(info!.tldr).toBe("Call recording.");
    expect(info!.transcript).toContain("renew the contract");
  });

  it("updates caption without changing the stored tldr", async () => {
    const src = join(ctx.baseDir, "photo.png");
    await writeTinyPng(src);
    const r = await store({ sourcePath: src, originalName: "photo.png", tldr: "Mission still." }, { wsPath: ctx.wsPath, embedder });

    await update(r.id, { caption: "Astronaut standing beside a rover on a red plain." }, { wsPath: ctx.wsPath });

    const info = await getFileInfo(r.id, { wsPath: ctx.wsPath, includeCaption: true });
    expect(info!.tldr).toBe("Mission still.");
    expect(info!.caption).toContain("rover");
  });

  it("assigns a unique canonical name when renaming into an existing file name", async () => {
    const src1 = join(ctx.baseDir, "first.md");
    const src2 = join(ctx.baseDir, "second.md");
    await writeFile(src1, "first file");
    await writeFile(src2, "second file");

    const first = await store({ sourcePath: src1, originalName: "Alpha.md" }, { wsPath: ctx.wsPath, embedder });
    const second = await store({ sourcePath: src2, originalName: "Beta.md" }, { wsPath: ctx.wsPath, embedder });

    await update(second.id, { displayName: "Alpha.md" }, { wsPath: ctx.wsPath });

    const updated = await getFileInfo(second.id, { wsPath: ctx.wsPath, includeDigest: true });
    expect(updated?.display_name).toBe("Alpha (2).md");
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

  it("filters files by taxonomy path before pagination", async () => {
    const src1 = join(ctx.baseDir, "alpha.md");
    const src2 = join(ctx.baseDir, "beta.md");
    await writeFile(src1, "alpha taxonomy fixture");
    await writeFile(src2, "beta taxonomy fixture");

    const first = await store({ sourcePath: src1 }, { wsPath: ctx.wsPath, embedder });
    const second = await store({ sourcePath: src2 }, { wsPath: ctx.wsPath, embedder });

    const db = await createDatabase(join(ctx.wsPath, "db"));
    const table = await getFilesTable(db);

    for (const [id, taxonomyPath] of [
      [first.id, ["All", "Alpha"]],
      [second.id, ["All", "Beta"]],
    ] as const) {
      const rows = await table.query().where(`id = '${id}'`).toArray();
      const row = { ...(rows[0] as Record<string, unknown>), taxonomy_path: taxonomyPath };
      await table.delete(`id = '${id}'`);
      await insertFileRecord(table, row);
    }

    const filtered = await listFiles({ limit: 10, taxonomyPath: ["All", "Alpha"] }, { wsPath: ctx.wsPath });

    expect(filtered.total).toBe(1);
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0]?.id).toBe(first.id);
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
