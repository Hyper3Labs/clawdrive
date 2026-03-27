import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import {
  MockEmbeddingProvider,
  createPot,
  initWorkspace,
  resolveWorkspacePath,
  store,
} from "@clawdrive/core";

const { setupContextMock, setupWorkspaceContextMock } = vi.hoisted(() => ({
  setupContextMock: vi.fn(),
  setupWorkspaceContextMock: vi.fn(),
}));

vi.mock("../src/helpers.js", async () => {
  const actual = await vi.importActual<typeof import("../src/helpers.js")>("../src/helpers.js");
  return {
    ...actual,
    setupContext: setupContextMock,
    setupWorkspaceContext: setupWorkspaceContextMock,
  };
});

import { registerSearchCommand } from "../src/commands/search.js";

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

function createProgram() {
  return new Command()
    .name("cdrive")
    .option("--workspace <name>", "Workspace name", "test")
    .option("--json", "JSON output")
    .exitOverride();
}

async function runCommand(program: Command, args: string[]) {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

  try {
    await program.parseAsync(["node", "cdrive", "--json", ...args], { from: "node" });
    return {
      logs: logSpy.mock.calls.map(([value]) => String(value)),
      errors: errorSpy.mock.calls.map(([value]) => String(value)),
    };
  } finally {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  }
}

describe("CLI search command", () => {
  let ctx: Awaited<ReturnType<typeof createTestWorkspace>>;
  let embedder: MockEmbeddingProvider;

  beforeEach(async () => {
    ctx = await createTestWorkspace();
    embedder = new MockEmbeddingProvider(3072);

    setupContextMock.mockResolvedValue({
      wsPath: ctx.wsPath,
      embedder,
      baseDir: ctx.baseDir,
      config: {
        default_workspace: "test",
      },
    });
    setupWorkspaceContextMock.mockResolvedValue({
      wsPath: ctx.wsPath,
      baseDir: ctx.baseDir,
      config: {
        default_workspace: "test",
      },
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    setupContextMock.mockReset();
    setupWorkspaceContextMock.mockReset();
    process.exitCode = undefined;
    await ctx.cleanup();
  });

  it("returns results for a basic text search", async () => {
    const src = join(ctx.baseDir, "searchable.md");
    await writeFile(src, "# Machine Learning\n\nDeep learning techniques for NLP.");
    await store({ sourcePath: src }, { wsPath: ctx.wsPath, embedder });

    const program = createProgram();
    registerSearchCommand(program);

    const result = await runCommand(program, ["search", "machine learning"]);
    expect(result.errors).toEqual([]);
    expect(result.logs).toHaveLength(1);

    const output = JSON.parse(result.logs[0]);
    expect(Array.isArray(output)).toBe(true);
    expect(output.length).toBeGreaterThanOrEqual(1);
    expect(output[0]).toHaveProperty("id");
    expect(output[0]).toHaveProperty("score");
    expect(output[0]).toHaveProperty("file");
  });

  it("scopes search results with --pot filter", async () => {
    const pot = await createPot({ name: "ML Papers" }, { wsPath: ctx.wsPath });

    const inPot = join(ctx.baseDir, "in-pot.md");
    await writeFile(inPot, "# Transformer Architecture\n\nAttention is all you need.");
    await store(
      { sourcePath: inPot, tags: [`pot:${pot.slug}`] },
      { wsPath: ctx.wsPath, embedder },
    );

    const outPot = join(ctx.baseDir, "out-pot.md");
    await writeFile(outPot, "# Cooking Recipes\n\nHow to make pasta from scratch.");
    await store({ sourcePath: outPot }, { wsPath: ctx.wsPath, embedder });

    const program = createProgram();
    registerSearchCommand(program);

    const result = await runCommand(program, ["search", "--pot", pot.slug, "architecture"]);
    expect(result.errors).toEqual([]);

    const output = JSON.parse(result.logs[0]);
    expect(Array.isArray(output)).toBe(true);
    for (const item of output) {
      expect(item.tags).toContain(`pot:${pot.slug}`);
    }
  });

  it("respects --limit to cap result count", async () => {
    for (let i = 0; i < 3; i++) {
      const src = join(ctx.baseDir, `doc-${i}.md`);
      await writeFile(src, `# Document ${i}\n\nContent about topic number ${i}.`);
      await store({ sourcePath: src }, { wsPath: ctx.wsPath, embedder });
    }

    const program = createProgram();
    registerSearchCommand(program);

    const result = await runCommand(program, ["search", "--limit", "1", "document topic"]);
    expect(result.errors).toEqual([]);

    const output = JSON.parse(result.logs[0]);
    expect(Array.isArray(output)).toBe(true);
    expect(output.length).toBeLessThanOrEqual(1);
  });

  it("returns empty array for a nonsensical query with no matches", async () => {
    const program = createProgram();
    registerSearchCommand(program);

    const result = await runCommand(program, ["search", "xyzzy-gibberish-no-match-12345"]);
    expect(result.errors).toEqual([]);

    const output = JSON.parse(result.logs[0]);
    expect(Array.isArray(output)).toBe(true);
    expect(output).toHaveLength(0);
  });

  it("errors when search is called without a query", async () => {
    const program = createProgram();
    registerSearchCommand(program);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as never);

    try {
      await program.parseAsync(["node", "cdrive", "--json", "search"], { from: "node" });
    } catch {
      // Expected — process.exit throws
    }

    const errors = errorSpy.mock.calls.map(([value]) => String(value));
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/[Ss]earch/);

    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });
});
