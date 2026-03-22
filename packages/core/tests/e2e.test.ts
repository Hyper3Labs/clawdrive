import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { store } from "../src/store.js";
import { search } from "../src/search.js";
import { getFileInfo, getFilePath, exportFile } from "../src/read.js";
import { remove, update, gc, doctor, listFiles } from "../src/manage.js";
import { getTaxonomyTree } from "../src/taxonomy.js";
import { createTestWorkspace } from "./helpers.js";
import { MockEmbeddingProvider } from "../src/embedding/mock.js";
import { writeFile, stat, readFile } from "node:fs/promises";
import { join } from "node:path";

describe("E2E pipeline", () => {
  let ctx: Awaited<ReturnType<typeof createTestWorkspace>>;
  let embedder: MockEmbeddingProvider;

  beforeEach(async () => {
    ctx = await createTestWorkspace();
    embedder = new MockEmbeddingProvider(3072);
  });
  afterEach(async () => { await ctx.cleanup(); });

  it("full lifecycle: store → search → info → update → export → rm → gc", async () => {
    // 1. Store a file
    const src = join(ctx.baseDir, "test-doc.md");
    await writeFile(src, "# Neural Networks\n\nDeep learning architectures for image classification.");
    const storeResult = await store(
      { sourcePath: src, tags: ["ml"], description: "ML research" },
      { wsPath: ctx.wsPath, embedder }
    );
    expect(storeResult.status).toBe("stored");
    expect(storeResult.id).toBeDefined();

    // 2. Search for it
    const searchResults = await search(
      { query: "deep learning", limit: 5 },
      { wsPath: ctx.wsPath, embedder }
    );
    expect(searchResults.length).toBeGreaterThan(0);

    // 3. Get info
    const info = await getFileInfo(storeResult.id, { wsPath: ctx.wsPath });
    expect(info).not.toBeNull();
    expect(info!.original_name).toBe("test-doc.md");
    expect(info!.tags).toContain("ml");
    expect(info!.description).toBe("ML research");
    expect(info!.status).toBe("embedded");

    // 4. Get file path
    const filePath = await getFilePath(storeResult.id, { wsPath: ctx.wsPath });
    expect(filePath).toBeDefined();
    const fileExists = await stat(filePath!).then(() => true).catch(() => false);
    expect(fileExists).toBe(true);

    // 5. Update tags
    await update(storeResult.id, { tags: ["ml", "research"], description: "Updated desc" }, { wsPath: ctx.wsPath });
    const updatedInfo = await getFileInfo(storeResult.id, { wsPath: ctx.wsPath });
    expect(updatedInfo!.tags).toContain("research");
    expect(updatedInfo!.description).toBe("Updated desc");

    // 6. Export
    const exportDest = join(ctx.baseDir, "exported.md");
    await exportFile(storeResult.id, exportDest, { wsPath: ctx.wsPath });
    const exportedContent = await readFile(exportDest, "utf-8");
    expect(exportedContent).toContain("Neural Networks");

    // 7. List files
    const listing = await listFiles({ limit: 10 }, { wsPath: ctx.wsPath });
    expect(listing.items.length).toBe(1);
    expect(listing.items[0].id).toBe(storeResult.id);

    // 8. Remove
    await remove(storeResult.id, { wsPath: ctx.wsPath });
    const afterRm = await search(
      { query: "deep learning", limit: 5 },
      { wsPath: ctx.wsPath, embedder }
    );
    expect(afterRm.find(r => r.id === storeResult.id)).toBeUndefined();

    // 9. GC (must run before doctor to clean up soft-deleted rows and orphaned files)
    const gcResult = await gc({ wsPath: ctx.wsPath });
    expect(gcResult.deletedRows).toBeGreaterThanOrEqual(1);

    // 10. Doctor (should be healthy after GC)
    const health = await doctor({ wsPath: ctx.wsPath });
    expect(health.healthy).toBe(true);
  });

  it("stores multiple files and searches across them", async () => {
    // Store 3 different files
    const files = [
      { name: "physics.md", content: "# Quantum Mechanics\n\nWave-particle duality and Schrodinger equation." },
      { name: "cooking.md", content: "# Pasta Recipe\n\nBoil water and add salt before cooking pasta." },
      { name: "coding.md", content: "# TypeScript Guide\n\nTypeScript adds static types to JavaScript." },
    ];

    for (const f of files) {
      const src = join(ctx.baseDir, f.name);
      await writeFile(src, f.content);
      await store({ sourcePath: src }, { wsPath: ctx.wsPath, embedder });
    }

    // Search should return results
    const results = await search(
      { query: "programming", limit: 10 },
      { wsPath: ctx.wsPath, embedder }
    );
    expect(results.length).toBe(3); // mock embedder returns all

    // List should show 3 files
    const listing = await listFiles({ limit: 10 }, { wsPath: ctx.wsPath });
    expect(listing.items.length).toBe(3);

    // Taxonomy tree should exist
    const tree = await getTaxonomyTree({ wsPath: ctx.wsPath });
    expect(tree).not.toBeNull();
  });

  it("handles duplicate detection", async () => {
    const src = join(ctx.baseDir, "dup.md");
    await writeFile(src, "duplicate content here");
    const r1 = await store({ sourcePath: src }, { wsPath: ctx.wsPath, embedder });
    const r2 = await store({ sourcePath: src }, { wsPath: ctx.wsPath, embedder });
    expect(r1.status).toBe("stored");
    expect(r2.status).toBe("duplicate");
    expect(r2.duplicateId).toBe(r1.id);

    // Only one file should be listed
    const listing = await listFiles({ limit: 10 }, { wsPath: ctx.wsPath });
    expect(listing.items.length).toBe(1);
  });
});
