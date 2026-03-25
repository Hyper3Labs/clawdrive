import { describe, it, expect, beforeEach, afterEach } from "vitest";
import sharp from "sharp";
import { store } from "../src/store.js";
import { getFileInfo } from "../src/read.js";
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

  it("reindexes the same file when the embedding model changes", async () => {
    const src = join(ctx.baseDir, "test.md");
    const primaryEmbedder = new MockEmbeddingProvider(3072, "model-a");
    const secondaryEmbedder = new MockEmbeddingProvider(3072, "model-b");

    await writeFile(src, "duplicate content");

    const r1 = await store({ sourcePath: src }, { wsPath: ctx.wsPath, embedder: primaryEmbedder });
    const r2 = await store({ sourcePath: src }, { wsPath: ctx.wsPath, embedder: secondaryEmbedder });

    expect(r1.status).toBe("stored");
    expect(r2.status).toBe("stored");

    const db = await createDatabase(join(ctx.wsPath, "db"));
    const table = await getFilesTable(db);
    const rows = await queryFiles(table);
    const parents = rows.filter((row) => row.original_name === "test.md" && row.parent_id === null);

    expect(parents).toHaveLength(2);
    expect(parents.map((row) => row.embedding_model).sort()).toEqual(["model-a", "model-b"]);
  });

  it("allows retrying the same file after a failed ingest", async () => {
    const src = join(ctx.baseDir, "retry.md");
    const failingEmbedder = {
      dimensions: 3072,
      modelId: "model-a",
      async embed(): Promise<Float32Array> {
        throw new Error("embed failed");
      },
    };

    await writeFile(src, "retry content");

    await expect(store({ sourcePath: src }, { wsPath: ctx.wsPath, embedder: failingEmbedder })).rejects.toThrow(
      "embed failed",
    );

    const retryResult = await store({ sourcePath: src }, { wsPath: ctx.wsPath, embedder });
    expect(retryResult.status).toBe("stored");

    const db = await createDatabase(join(ctx.wsPath, "db"));
    const table = await getFilesTable(db);
    const rows = await queryFiles(table);
    const parents = rows.filter((row) => row.original_name === "retry.md" && row.parent_id === null);

    expect(parents).toHaveLength(2);
    expect(parents.some((row) => row.status === "failed")).toBe(true);
    expect(parents.some((row) => row.status === "embedded")).toBe(true);
  });

  it("treats an in-flight ingest for the same file and model as a duplicate", async () => {
    const src = join(ctx.baseDir, "concurrent.md");
    let releaseEmbed!: () => void;
    let notifyEmbedStarted!: () => void;
    const embedCanFinish = new Promise<void>((resolve) => {
      releaseEmbed = resolve;
    });
    const embedStarted = new Promise<void>((resolve) => {
      notifyEmbedStarted = resolve;
    });
    let embedCalls = 0;

    const slowEmbedder = {
      dimensions: 3072,
      modelId: "model-a",
      async embed(): Promise<Float32Array> {
        embedCalls += 1;
        notifyEmbedStarted();
        await embedCanFinish;
        const vector = new Float32Array(3072);
        vector[0] = 1;
        return vector;
      },
    };

    await writeFile(src, "concurrent content");

    const firstStore = store({ sourcePath: src }, { wsPath: ctx.wsPath, embedder: slowEmbedder });
    await embedStarted;

    const duplicateResult = await store({ sourcePath: src }, { wsPath: ctx.wsPath, embedder: slowEmbedder });
    releaseEmbed();
    const firstResult = await firstStore;

    expect(firstResult.status).toBe("stored");
    expect(duplicateResult.status).toBe("duplicate");
    expect(embedCalls).toBe(1);

    const db = await createDatabase(join(ctx.wsPath, "db"));
    const table = await getFilesTable(db);
    const rows = await queryFiles(table);
    const parents = rows.filter((row) => row.original_name === "concurrent.md" && row.parent_id === null);

    expect(parents).toHaveLength(1);
    expect(parents[0]?.status).toBe("embedded");
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

  it("stores tldr and exposes it as the short summary", async () => {
    const src = join(ctx.baseDir, "abstracted.md");
    await writeFile(src, "abstract content");
    await store(
      {
        sourcePath: src,
        tldr: "Short summary of the file for quick filtering.",
      },
      { wsPath: ctx.wsPath, embedder },
    );
    const db = await createDatabase(join(ctx.wsPath, "db"));
    const table = await getFilesTable(db);
    const rows = await queryFiles(table);
    expect(rows[0].tldr).toBe("Short summary of the file for quick filtering.");
    expect(rows[0].description).toBe("Short summary of the file for quick filtering.");
  });

  it("stores digest as a direct-read overview layer", async () => {
    const src = join(ctx.baseDir, "digest.md");
    await writeFile(src, "digest content");

    const result = await store(
      {
        sourcePath: src,
        digest: "# Digest\n\nShort orientation paragraph.\n\n## Quick Navigation\n- Key point\n\n## Detailed Description\nMore context.",
      },
      { wsPath: ctx.wsPath, embedder },
    );

    const info = await getFileInfo(result.id, { wsPath: ctx.wsPath, includeDigest: true });
    expect(info?.digest).toContain("## Quick Navigation");
    expect(info?.description).toBeNull();
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

  it("stores images with native media embeddings instead of metadata text", async () => {
    const src = join(ctx.baseDir, "mars.webp");
    await sharp({
      create: {
        width: 16,
        height: 16,
        channels: 3,
        background: { r: 220, g: 80, b: 40 },
      },
    }).webp().toFile(src);

    await store({ sourcePath: src, tldr: "Mars surface color study" }, { wsPath: ctx.wsPath, embedder });

    const db = await createDatabase(join(ctx.wsPath, "db"));
    const table = await getFilesTable(db);
    const rows = await queryFiles(table);
    const imageRow = rows.find((row) => row.original_name === "mars.webp");

    expect(imageRow?.status).toBe("embedded");
    expect(imageRow?.searchable_text).toContain("Mars surface color study");
    expect(Array.from(imageRow?.vector ?? []).some((value) => value !== 0)).toBe(true);
  });

  it("marks unsupported binaries as failed instead of embedding metadata text", async () => {
    const src = join(ctx.baseDir, "payload.bin");
    await writeFile(src, Buffer.from([0, 159, 146, 150]));

    await expect(store({ sourcePath: src }, { wsPath: ctx.wsPath, embedder })).rejects.toThrow(
      "Unsupported file type for Gemini embeddings",
    );

    const db = await createDatabase(join(ctx.wsPath, "db"));
    const table = await getFilesTable(db);
    const rows = await queryFiles(table);
    const failedRow = rows.find((row) => row.original_name === "payload.bin");

    expect(failedRow?.status).toBe("failed");
    expect(failedRow?.error_message).toContain("Unsupported file type for Gemini embeddings");
  });

  it("aggregates child vectors into the parent vector", async () => {
    const src = join(ctx.baseDir, "large.md");
    const paragraph = "Telemetry and orbital mechanics data for the mission architecture. ".repeat(200);
    const content = `# Section One\n\n${paragraph}\n\n# Section Two\n\n${paragraph}\n\n# Section Three\n\n${paragraph}`;
    await writeFile(src, content);

    await store({ sourcePath: src }, { wsPath: ctx.wsPath, embedder });

    const db = await createDatabase(join(ctx.wsPath, "db"));
    const table = await getFilesTable(db);
    const rows = await queryFiles(table);
    const parent = rows.find((row) => row.original_name === "large.md" && row.parent_id === null);
    const children = rows
      .filter((row) => row.original_name === "large.md" && row.parent_id === parent?.id)
      .sort((a, b) => (a.chunk_index ?? 0) - (b.chunk_index ?? 0));

    expect(children.length).toBeGreaterThan(1);

    const expected = new Float32Array(embedder.dimensions);
    for (const child of children) {
      for (let i = 0; i < expected.length; i++) {
        expected[i] += child.vector[i];
      }
    }
    for (let i = 0; i < expected.length; i++) {
      expected[i] /= children.length;
    }
    let norm = 0;
    for (let i = 0; i < expected.length; i++) {
      norm += expected[i] * expected[i];
    }
    norm = Math.sqrt(norm);
    for (let i = 0; i < expected.length; i++) {
      expected[i] /= norm;
    }

    for (let i = 0; i < 32; i++) {
      expect(parent?.vector[i]).toBeCloseTo(expected[i], 6);
    }
  });
});
