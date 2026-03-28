import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MockEmbeddingProvider,
  buildPotTag,
  createPot,
  getFileInfo,
  initWorkspace,
  resolveWorkspacePath,
  store,
} from "@clawdrive/core";
import { importSourceToPot } from "../src/pot-import.js";

async function createTestWorkspace() {
  const baseDir = await mkdtemp(join(tmpdir(), "clawdrive-cli-test-"));
  const wsPath = resolveWorkspacePath(baseDir, "test");
  await initWorkspace(wsPath);
  return {
    baseDir,
    wsPath,
    cleanup: () => rm(baseDir, { recursive: true, force: true }),
  };
}

describe("pot import metadata reconciliation", () => {
  let ctx: Awaited<ReturnType<typeof createTestWorkspace>>;
  let embedder: MockEmbeddingProvider;

  beforeEach(async () => {
    ctx = await createTestWorkspace();
    embedder = new MockEmbeddingProvider(3072);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("fills missing metadata when attaching an existing file to a pot", async () => {
    const sourcePath = join(ctx.baseDir, "nasa-image.jpg");
    await writeFile(sourcePath, "demo bytes");

    const stored = await store({ sourcePath }, { wsPath: ctx.wsPath, embedder });
    expect(stored.status).toBe("stored");

    const pot = await createPot({ name: "NASA Demo" }, { wsPath: ctx.wsPath });

    const result = await importSourceToPot(
      {
        source: "nasa-image.jpg",
        path: sourcePath,
        displayName: "Jupiter Storms.jpg",
        tldr: "Sample NASA image for demo browsing.",
        digest: "# Jupiter Storms\n\n- Source: NASA demo\n- Purpose: sample image",
      },
      pot.slug,
      { wsPath: ctx.wsPath, embedder },
    );

    expect(result.status).toBe("attached");

    const file = await getFileInfo(result.id!, { wsPath: ctx.wsPath, includeDigest: true });
    expect(file).toMatchObject({
      display_name: "Jupiter Storms.jpg",
      tldr: "Sample NASA image for demo browsing.",
      digest: "# Jupiter Storms\n\n- Source: NASA demo\n- Purpose: sample image",
    });
    expect(file?.tags).toContain(buildPotTag(pot.slug));
  });

  it("fills missing metadata even when the file is already in the pot", async () => {
    const sourcePath = join(ctx.baseDir, "nasa-existing.jpg");
    await writeFile(sourcePath, "existing demo bytes");

    const pot = await createPot({ name: "NASA Demo" }, { wsPath: ctx.wsPath });
    const stored = await store(
      {
        sourcePath,
        tags: [buildPotTag(pot.slug)],
      },
      { wsPath: ctx.wsPath, embedder },
    );
    expect(stored.status).toBe("stored");

    const result = await importSourceToPot(
      {
        source: "nasa-existing.jpg",
        path: sourcePath,
        displayName: "Mars Descent.jpg",
        tldr: "Sample NASA image for semantic search and taxonomy.",
        digest: "# Mars Descent\n\n- Source: NASA demo\n- Purpose: sample image",
      },
      pot.slug,
      { wsPath: ctx.wsPath, embedder },
    );

    expect(result.status).toBe("existing");

    const file = await getFileInfo(result.id!, { wsPath: ctx.wsPath, includeDigest: true });
    expect(file).toMatchObject({
      display_name: "Mars Descent.jpg",
      tldr: "Sample NASA image for semantic search and taxonomy.",
      digest: "# Mars Descent\n\n- Source: NASA demo\n- Purpose: sample image",
    });
    expect(file?.tags).toContain(buildPotTag(pot.slug));
  });
});
