import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MockEmbeddingProvider } from "../src/embedding/mock.js";
import { buildPotTag } from "../src/metadata.js";
import { createPot, listPotFiles, renamePot, deletePot, listPots } from "../src/pots.js";
import { store } from "../src/store.js";
import { createTestWorkspace } from "./helpers.js";

describe("pots", () => {
  let ctx: Awaited<ReturnType<typeof createTestWorkspace>>;
  let embedder: MockEmbeddingProvider;

  beforeEach(async () => {
    ctx = await createTestWorkspace();
    embedder = new MockEmbeddingProvider(3072);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("creates a pot with a stable slug", async () => {
    const pot = await createPot({ name: "Acme DD" }, { wsPath: ctx.wsPath });
    expect(pot.slug).toBe("acme-dd");
    expect(pot.name).toBe("Acme DD");
  });

  it("lists files tagged into a pot", async () => {
    const pot = await createPot({ name: "Acme DD" }, { wsPath: ctx.wsPath });
    const src = join(ctx.baseDir, "nda.md");
    await writeFile(src, "nda text");

    await store(
      {
        sourcePath: src,
        tags: [buildPotTag(pot.slug)],
      },
      { wsPath: ctx.wsPath, embedder },
    );

    const files = await listPotFiles(pot.slug, { wsPath: ctx.wsPath });
    expect(files).toHaveLength(1);
    expect(files[0].original_name).toBe("nda.md");
  });

  it("renames a pot and migrates tags on member files", async () => {
    const pot = await createPot({ name: "Old Name" }, { wsPath: ctx.wsPath });
    const src = join(ctx.baseDir, "rename-test.md");
    await writeFile(src, "content");

    await store(
      { sourcePath: src, tags: [buildPotTag(pot.slug)] },
      { wsPath: ctx.wsPath, embedder },
    );

    const renamed = await renamePot(pot.id, "New Name", { wsPath: ctx.wsPath });
    expect(renamed.name).toBe("New Name");
    expect(renamed.slug).toBe("new-name");
    expect(renamed.id).toBe(pot.id);

    const all = await listPots({ wsPath: ctx.wsPath });
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("New Name");

    // Verify pot tags were migrated on files
    const files = await listPotFiles("new-name", { wsPath: ctx.wsPath });
    expect(files).toHaveLength(1);
    expect(files[0].tags).toContain(buildPotTag("new-name"));
    expect(files[0].tags).not.toContain(buildPotTag("old-name"));
  });

  it("deletes a pot and removes pot tags from member files", async () => {
    const pot = await createPot({ name: "To Delete" }, { wsPath: ctx.wsPath });
    const src = join(ctx.baseDir, "tagged.md");
    await writeFile(src, "content");

    await store(
      { sourcePath: src, tags: [buildPotTag(pot.slug)] },
      { wsPath: ctx.wsPath, embedder },
    );

    let files = await listPotFiles(pot.slug, { wsPath: ctx.wsPath });
    expect(files).toHaveLength(1);
    expect(files[0].tags).toContain(buildPotTag(pot.slug));

    await deletePot(pot.id, { wsPath: ctx.wsPath });

    const all = await listPots({ wsPath: ctx.wsPath });
    expect(all).toHaveLength(0);

    // Verify pot tags were removed from member files
    const { getFileInfo } = await import("../src/read.js");
    const fileInfo = await getFileInfo(files[0].id, { wsPath: ctx.wsPath });
    expect(fileInfo!.tags).not.toContain(buildPotTag(pot.slug));
  });
});