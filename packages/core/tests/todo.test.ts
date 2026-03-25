import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { store } from "../src/store.js";
import { listTodos } from "../src/todo.js";
import { createTestWorkspace } from "./helpers.js";
import { MockEmbeddingProvider } from "../src/embedding/mock.js";

describe("todo", () => {
  let ctx: Awaited<ReturnType<typeof createTestWorkspace>>;
  let embedder: MockEmbeddingProvider;

  beforeEach(async () => {
    ctx = await createTestWorkspace();
    embedder = new MockEmbeddingProvider(3072);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("lists files missing tldr and digest", async () => {
    const missingSrc = join(ctx.baseDir, "missing.md");
    const tldrOnlySrc = join(ctx.baseDir, "tldr-only.md");
    const completeSrc = join(ctx.baseDir, "complete.md");

    await writeFile(missingSrc, "first file content");
    await writeFile(tldrOnlySrc, "second file content");
    await writeFile(completeSrc, "third file content");

    const missing = await store({ sourcePath: missingSrc }, { wsPath: ctx.wsPath, embedder });
    const tldrOnly = await store(
      {
        sourcePath: tldrOnlySrc,
        tldr: "Short summary for the second file.",
      },
      { wsPath: ctx.wsPath, embedder },
    );
    await store(
      {
        sourcePath: completeSrc,
        tldr: "Short summary for the complete file.",
        digest: "# Digest\n\nOpening paragraph.\n\n## Quick Navigation\n- One\n\n## Detailed Description\nDone.",
      },
      { wsPath: ctx.wsPath, embedder },
    );

    const result = await listTodos({ limit: 10 }, { wsPath: ctx.wsPath });

    expect(result.total).toBe(2);

    const missingItem = result.items.find((item) => item.id === missing.id);
    const tldrOnlyItem = result.items.find((item) => item.id === tldrOnly.id);

    expect(missingItem?.missing).toEqual(["tldr", "digest"]);
    expect(tldrOnlyItem?.missing).toEqual(["digest"]);
  });

  it("filters by kind and paginates todo items", async () => {
    for (const fileName of ["a.md", "b.md", "c.md"]) {
      const sourcePath = join(ctx.baseDir, fileName);
      await writeFile(sourcePath, `${fileName} content`);
      await store(
        {
          sourcePath,
          tldr: `Short summary for ${fileName}.`,
        },
        { wsPath: ctx.wsPath, embedder },
      );
    }

    const page1 = await listTodos({ kinds: ["digest"], limit: 2 }, { wsPath: ctx.wsPath });
    expect(page1.total).toBe(3);
    expect(page1.items).toHaveLength(2);
    expect(page1.items.every((item) => item.missing.every((kind) => kind === "digest"))).toBe(true);
    expect(page1.nextCursor).toBeDefined();

    const page2 = await listTodos(
      { kinds: ["digest"], limit: 2, cursor: page1.nextCursor },
      { wsPath: ctx.wsPath },
    );
    expect(page2.items).toHaveLength(1);
    expect(page2.nextCursor).toBeUndefined();
  });
});