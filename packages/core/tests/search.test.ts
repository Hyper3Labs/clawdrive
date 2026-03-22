import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { search } from "../src/search.js";
import { store } from "../src/store.js";
import { createTestWorkspace } from "./helpers.js";
import { MockEmbeddingProvider } from "../src/embedding/mock.js";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

describe("search", () => {
  let ctx: Awaited<ReturnType<typeof createTestWorkspace>>;
  let embedder: MockEmbeddingProvider;

  beforeEach(async () => {
    ctx = await createTestWorkspace();
    embedder = new MockEmbeddingProvider(3072);
    // Store test files
    const f1 = join(ctx.baseDir, "ml-paper.md");
    await writeFile(f1, "# Machine Learning\n\nNeural networks are powerful tools for classification.");
    await store({ sourcePath: f1, tags: ["ml"] }, { wsPath: ctx.wsPath, embedder });

    const f2 = join(ctx.baseDir, "recipe.md");
    await writeFile(f2, "# Chocolate Cake\n\nMix flour and cocoa powder together.");
    await store({ sourcePath: f2, tags: ["cooking"] }, { wsPath: ctx.wsPath, embedder });
  });
  afterEach(async () => { await ctx.cleanup(); });

  it("returns results with scores", async () => {
    const results = await search(
      { query: "machine learning", limit: 10 },
      { wsPath: ctx.wsPath, embedder }
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].score).toBeDefined();
    expect(typeof results[0].score).toBe("number");
    expect(results[0].file).toBeDefined();
  });

  it("returns all stored files when querying broadly", async () => {
    const results = await search(
      { query: "content", limit: 10 },
      { wsPath: ctx.wsPath, embedder }
    );
    expect(results.length).toBe(2);
  });

  it("filters by tags", async () => {
    const results = await search(
      { query: "anything", tags: ["cooking"], limit: 10 },
      { wsPath: ctx.wsPath, embedder }
    );
    expect(results.length).toBe(1);
    expect(results[0].tags).toContain("cooking");
  });

  it("filters by content type", async () => {
    const results = await search(
      { query: "anything", contentType: "text/markdown", limit: 10 },
      { wsPath: ctx.wsPath, embedder }
    );
    expect(results.every(r => r.contentType === "text/markdown")).toBe(true);
  });

  it("respects limit", async () => {
    const results = await search(
      { query: "anything", limit: 1 },
      { wsPath: ctx.wsPath, embedder }
    );
    expect(results.length).toBe(1);
  });

  it("returns results sorted by score descending", async () => {
    const results = await search(
      { query: "anything", limit: 10 },
      { wsPath: ctx.wsPath, embedder }
    );
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });
});
