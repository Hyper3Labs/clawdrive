import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import {
  MockEmbeddingProvider,
  initWorkspace,
  listPotFiles,
  resolveWorkspacePath,
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

import { registerPotCommand } from "../src/commands/pot.js";

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

describe("CLI pot commands", () => {
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

  it("creates a pot with pot create", async () => {
    const program = createProgram();
    registerPotCommand(program);

    const result = await runCommand(program, ["pot", "create", "my-pot"]);
    expect(result.errors).toEqual([]);
    expect(result.logs).toHaveLength(1);

    const output = JSON.parse(result.logs[0]);
    expect(output).toHaveProperty("slug");
    expect(output).toHaveProperty("name");
    expect(output.name).toBe("my-pot");
    expect(output.slug).toBeTruthy();
  });

  it("creates a pot with a description via --desc", async () => {
    const program = createProgram();
    registerPotCommand(program);

    const result = await runCommand(program, ["pot", "create", "described-pot", "--desc", "Test description"]);
    expect(result.errors).toEqual([]);
    expect(result.logs).toHaveLength(1);

    const output = JSON.parse(result.logs[0]);
    expect(output.name).toBe("described-pot");
    expect(output.description).toBe("Test description");
  });

  it("adds a file to a pot via pot add", async () => {
    const program1 = createProgram();
    registerPotCommand(program1);

    const createResult = await runCommand(program1, ["pot", "create", "file-pot"]);
    const pot = JSON.parse(createResult.logs[0]);

    const src = join(ctx.baseDir, "potfile.md");
    await writeFile(src, "# Pot File\n\nContent for the pot.");

    const program2 = createProgram();
    registerPotCommand(program2);

    const addResult = await runCommand(program2, ["pot", "add", pot.slug, src]);
    expect(addResult.errors).toEqual([]);
    expect(addResult.logs).toHaveLength(1);

    const output = JSON.parse(addResult.logs[0]);
    expect(output).toMatchObject({
      pot: pot.slug,
      total: 1,
      stored: 1,
    });

    const potFiles = await listPotFiles(pot.slug, { wsPath: ctx.wsPath });
    expect(potFiles).toHaveLength(1);
    expect(potFiles[0]?.original_name).toBe("potfile.md");
  });

  it("deletes a pot with pot delete", async () => {
    const program1 = createProgram();
    registerPotCommand(program1);
    await runCommand(program1, ["pot", "create", "doomed-pot"]);

    const program2 = createProgram();
    registerPotCommand(program2);
    const result = await runCommand(program2, ["pot", "delete", "doomed-pot"]);

    expect(result.errors).toEqual([]);
    expect(result.logs).toHaveLength(1);

    const output = JSON.parse(result.logs[0]);
    expect(output).toMatchObject({ deleted: true, slug: "doomed-pot" });

    // Verify pot is gone
    const program3 = createProgram();
    registerPotCommand(program3);
    const listResult = await runCommand(program3, ["pot", "list"]);
    const pots = JSON.parse(listResult.logs[0]);
    expect(pots).toHaveLength(0);
  });

  it("lists pots with pot list", async () => {
    const program1 = createProgram();
    registerPotCommand(program1);
    await runCommand(program1, ["pot", "create", "alpha-pot"]);

    const program2 = createProgram();
    registerPotCommand(program2);
    await runCommand(program2, ["pot", "create", "beta-pot"]);

    const program3 = createProgram();
    registerPotCommand(program3);
    const result = await runCommand(program3, ["pot", "list"]);

    expect(result.errors).toEqual([]);
    expect(result.logs).toHaveLength(1);

    const output = JSON.parse(result.logs[0]);
    expect(output).toHaveLength(2);
    expect(output.map((p: any) => p.name)).toContain("alpha-pot");
    expect(output.map((p: any) => p.name)).toContain("beta-pot");
    expect(output[0]).toHaveProperty("fileCount");
  });
});
