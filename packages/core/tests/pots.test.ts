import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MockEmbeddingProvider } from "../src/embedding/mock.js";
import { buildPotTag } from "../src/metadata.js";
import { createPot, listPotFiles } from "../src/pots.js";
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
});