import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { search } from "../src/search.js";
import { buildPotTag } from "../src/metadata.js";
import { createPot } from "../src/pots.js";
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

  it("filters by pot", async () => {
    const pot = await createPot({ name: "Acme DD" }, { wsPath: ctx.wsPath });
    const f3 = join(ctx.baseDir, "nda.md");
    await writeFile(f3, "acme nda content");
    await store(
      { sourcePath: f3, tags: [buildPotTag(pot.slug)] },
      { wsPath: ctx.wsPath, embedder },
    );

    const results = await search(
      { query: "nda", pot: "Acme DD", limit: 10 },
      { wsPath: ctx.wsPath, embedder },
    );

    expect(results).toHaveLength(1);
    expect(results[0].file).toBe("nda.md");
    expect(results[0].tags).toContain(buildPotTag(pot.slug));
  });

  it("returns tldr in search results when present", async () => {
    const f3 = join(ctx.baseDir, "summary.md");
    await writeFile(f3, "mission planning content");
    await store(
      {
        sourcePath: f3,
        tldr: "Mission planning note covering the selected trajectory and launch timing.",
      },
      { wsPath: ctx.wsPath, embedder },
    );

    const results = await search(
      { query: "trajectory", limit: 10 },
      { wsPath: ctx.wsPath, embedder },
    );

    const summary = results.find((result) => result.file === "summary.md");
    expect(summary?.tldr).toBe("Mission planning note covering the selected trajectory and launch timing.");
  });

  it("uses query images for real vector search", async () => {
    const imagePath = join(ctx.baseDir, "nebula.png");
    const otherImagePath = join(ctx.baseDir, "ocean.png");

    await sharp({
      create: {
        width: 12,
        height: 12,
        channels: 3,
        background: { r: 200, g: 50, b: 140 },
      },
    }).png().toFile(imagePath);

    await sharp({
      create: {
        width: 12,
        height: 12,
        channels: 3,
        background: { r: 30, g: 120, b: 220 },
      },
    }).png().toFile(otherImagePath);

    await store({ sourcePath: imagePath, tags: ["space"] }, { wsPath: ctx.wsPath, embedder });
    await store({ sourcePath: otherImagePath, tags: ["water"] }, { wsPath: ctx.wsPath, embedder });

    const results = await search(
      { queryImage: imagePath, contentType: "image/png", limit: 5 },
      { wsPath: ctx.wsPath, embedder },
    );

    expect(results[0]?.file).toBe("nebula.png");
  });

  it("uses PDF query files for real vector search", async () => {
    const pdfPath = join(ctx.baseDir, "reference.pdf");
    const otherPdfPath = join(ctx.baseDir, "other.pdf");

    const referencePdf = await PDFDocument.create();
    referencePdf.addPage([300, 300]).drawText("Artemis II mission reference guide");
    await writeFile(pdfPath, Buffer.from(await referencePdf.save()));

    const otherPdf = await PDFDocument.create();
    otherPdf.addPage([300, 300]).drawText("Ocean circulation field notes");
    await writeFile(otherPdfPath, Buffer.from(await otherPdf.save()));

    await store({ sourcePath: pdfPath }, { wsPath: ctx.wsPath, embedder });
    await store({ sourcePath: otherPdfPath }, { wsPath: ctx.wsPath, embedder });

    const results = await search(
      { queryFile: pdfPath, contentType: "application/pdf", limit: 5 },
      { wsPath: ctx.wsPath, embedder },
    );

    expect(results[0]?.file).toBe("reference.pdf");
  });

  it("reports totalChunks without counting the parent row as an extra chunk", async () => {
    const pdfPath = join(ctx.baseDir, "chunked.pdf");

    const pdf = await PDFDocument.create();
    for (let index = 0; index < 7; index += 1) {
      pdf.addPage([300, 300]).drawText(`Mission page ${index + 1}`);
    }
    await writeFile(pdfPath, Buffer.from(await pdf.save()));

    await store({ sourcePath: pdfPath }, { wsPath: ctx.wsPath, embedder });

    const results = await search(
      { queryFile: pdfPath, contentType: "application/pdf", limit: 5 },
      { wsPath: ctx.wsPath, embedder },
    );

    expect(results[0]?.file).toBe("chunked.pdf");
    expect(results[0]?.totalChunks).toBe(2);
  });

  it("filters search results to the current embedding model", async () => {
    const primaryEmbedder = new MockEmbeddingProvider(3072, "model-a");
    const secondaryEmbedder = new MockEmbeddingProvider(3072, "model-b");

    const alphaPath = join(ctx.baseDir, "alpha.md");
    const betaPath = join(ctx.baseDir, "beta.md");
    await writeFile(alphaPath, "orbital mechanics and docking procedures");
    await writeFile(betaPath, "orbital mechanics and docking procedures");

    await store({ sourcePath: alphaPath }, { wsPath: ctx.wsPath, embedder: primaryEmbedder });
    await store({ sourcePath: betaPath }, { wsPath: ctx.wsPath, embedder: secondaryEmbedder });

    const results = await search(
      { query: "orbital mechanics", limit: 10 },
      { wsPath: ctx.wsPath, embedder: primaryEmbedder },
    );

    expect(results.some((result) => result.file === "alpha.md")).toBe(true);
    expect(results.some((result) => result.file === "beta.md")).toBe(false);
  });
});
