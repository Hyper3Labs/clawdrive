import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import {
  MockEmbeddingProvider,
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

import { registerTodoCommand } from "../src/commands/todo.js";
import { registerTldrCommand } from "../src/commands/tldr.js";
import { registerDigestCommand } from "../src/commands/digest.js";
import { registerRenameCommand } from "../src/commands/rename.js";

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
  const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

  try {
    await program.parseAsync(["node", "cdrive", "--json", ...args], { from: "node" });
    return {
      logs: logSpy.mock.calls.map(([value]) => String(value)),
      errors: errorSpy.mock.calls.map(([value]) => String(value)),
      stdout: stdoutSpy.mock.calls.map(([value]) => String(value)),
    };
  } finally {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    stdoutSpy.mockRestore();
  }
}

describe("CLI metadata commands", () => {
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

  async function storeTestFile(name: string, content: string) {
    const src = join(ctx.baseDir, name);
    await writeFile(src, content);
    const result = await store({ sourcePath: src }, { wsPath: ctx.wsPath, embedder });
    return result;
  }

  // --- todo command ---

  it("lists files missing metadata with todo", async () => {
    await storeTestFile("todo-file.md", "# Untitled\n\nNo metadata set.");

    const program = createProgram();
    registerTodoCommand(program);

    const result = await runCommand(program, ["todo"]);
    expect(result.errors).toEqual([]);
    expect(result.logs).toHaveLength(1);

    const output = JSON.parse(result.logs[0]);
    expect(output).toHaveProperty("items");
    expect(output.items.length).toBeGreaterThanOrEqual(1);
    expect(output.items[0]).toHaveProperty("id");
    expect(output.items[0]).toHaveProperty("missing");
  });

  it("filters todo items by --kind tldr", async () => {
    await storeTestFile("todo-filter.md", "# Filter Test\n\nShould show up for tldr.");

    const program = createProgram();
    registerTodoCommand(program);

    const result = await runCommand(program, ["todo", "--kind", "tldr"]);
    expect(result.errors).toEqual([]);

    const output = JSON.parse(result.logs[0]);
    expect(output).toHaveProperty("items");
    for (const item of output.items) {
      expect(item.missing).toContain("tldr");
    }
  });

  // --- tldr command ---

  it("sets a tldr with --set", async () => {
    const storeResult = await storeTestFile("tldr-set.md", "# TL;DR Test\n\nContent here.");

    const program = createProgram();
    registerTldrCommand(program);

    const result = await runCommand(program, ["tldr", storeResult.id, "--set", "A concise summary of the document for quick reference by agents"]);
    expect(result.errors).toEqual([]);
    expect(result.logs).toHaveLength(1);

    const output = JSON.parse(result.logs[0]);
    expect(output).toHaveProperty("tldr");
    expect(output.tldr.tldr).toBe("A concise summary of the document for quick reference by agents");
  });

  it("gets a previously set tldr", async () => {
    const storeResult = await storeTestFile("tldr-get.md", "# TL;DR Get\n\nContent.");

    // First set it
    const setProgram = createProgram();
    registerTldrCommand(setProgram);
    await runCommand(setProgram, ["tldr", storeResult.id, "--set", "Previously set summary text for retrieval testing"]);

    // Then get it
    const getProgram = createProgram();
    registerTldrCommand(getProgram);
    const result = await runCommand(getProgram, ["tldr", storeResult.id]);
    expect(result.errors).toEqual([]);
    expect(result.logs).toHaveLength(1);

    const output = JSON.parse(result.logs[0]);
    expect(output.tldr).toBe("Previously set summary text for retrieval testing");
  });

  it("clears a tldr with --clear", async () => {
    const storeResult = await storeTestFile("tldr-clear.md", "# TL;DR Clear\n\nContent.");

    // Set then clear
    const setProgram = createProgram();
    registerTldrCommand(setProgram);
    await runCommand(setProgram, ["tldr", storeResult.id, "--set", "Temporary summary that will be cleared shortly"]);

    const clearProgram = createProgram();
    registerTldrCommand(clearProgram);
    const result = await runCommand(clearProgram, ["tldr", storeResult.id, "--clear"]);
    expect(result.errors).toEqual([]);
    expect(result.logs).toHaveLength(1);

    const output = JSON.parse(result.logs[0]);
    expect(output.tldr.tldr).toBeNull();
  });

  // --- digest command ---

  it("sets a digest with --set", async () => {
    const storeResult = await storeTestFile("digest-set.md", "# Digest Test\n\nContent.");

    const program = createProgram();
    registerDigestCommand(program);

    const result = await runCommand(program, ["digest", storeResult.id, "--set", "## Summary\n\nDetailed breakdown."]);
    expect(result.errors).toEqual([]);
    expect(result.logs).toHaveLength(1);

    const output = JSON.parse(result.logs[0]);
    expect(output).toHaveProperty("digest");
    expect(output.digest.digest).toBe("## Summary\n\nDetailed breakdown.");
  });

  it("clears a digest with --clear", async () => {
    const storeResult = await storeTestFile("digest-clear.md", "# Digest Clear\n\nContent.");

    const setProgram = createProgram();
    registerDigestCommand(setProgram);
    await runCommand(setProgram, ["digest", storeResult.id, "--set", "Temp digest"]);

    const clearProgram = createProgram();
    registerDigestCommand(clearProgram);
    const result = await runCommand(clearProgram, ["digest", storeResult.id, "--clear"]);
    expect(result.errors).toEqual([]);
    expect(result.logs).toHaveLength(1);

    const output = JSON.parse(result.logs[0]);
    expect(output.digest.digest).toBeNull();
  });

  // --- rename command ---

  it("sets a display name with --set", async () => {
    const storeResult = await storeTestFile("rename-set.md", "# Rename Test\n\nContent.");

    const program = createProgram();
    registerRenameCommand(program);

    const result = await runCommand(program, ["rename", storeResult.id, "--set", "Better Name.md"]);
    expect(result.errors).toEqual([]);
    expect(result.logs).toHaveLength(1);

    const output = JSON.parse(result.logs[0]);
    expect(output.displayName).toBe("Better Name.md");
    expect(output.originalName).toBe("rename-set.md");
  });

  it("clears a display name with --clear, reverting to original", async () => {
    const storeResult = await storeTestFile("rename-clear.md", "# Rename Clear\n\nContent.");

    const setProgram = createProgram();
    registerRenameCommand(setProgram);
    await runCommand(setProgram, ["rename", storeResult.id, "--set", "Custom Name.md"]);

    const clearProgram = createProgram();
    registerRenameCommand(clearProgram);
    const result = await runCommand(clearProgram, ["rename", storeResult.id, "--clear"]);
    expect(result.errors).toEqual([]);
    expect(result.logs).toHaveLength(1);

    const output = JSON.parse(result.logs[0]);
    expect(output.displayName).toBeNull();
    expect(output.originalName).toBe("rename-clear.md");
  });
});
