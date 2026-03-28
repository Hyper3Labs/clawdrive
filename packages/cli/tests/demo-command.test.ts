import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { MockEmbeddingProvider, initWorkspace, resolveWorkspacePath } from "@clawdrive/core";

const { setupContextMock, prepareDemoWorkspaceMock } = vi.hoisted(() => ({
  setupContextMock: vi.fn(),
  prepareDemoWorkspaceMock: vi.fn(),
}));

vi.mock("../src/helpers.js", async () => {
  const actual = await vi.importActual<typeof import("../src/helpers.js")>("../src/helpers.js");
  return {
    ...actual,
    setupContext: setupContextMock,
  };
});

vi.mock("../src/demo/nasa.js", () => ({
  prepareDemoWorkspace: prepareDemoWorkspaceMock,
}));

import { registerDemoCommand } from "../src/commands/demo.js";

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

describe("CLI demo command", () => {
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

    prepareDemoWorkspaceMock.mockResolvedValue({
      dataset: "nasa",
      pot: "nasa-demo",
      createdPot: true,
      downloaded: 0,
      total: 52,
      stored: 52,
      attached: 0,
      existing: 0,
      failed: 0,
      alreadyInstalled: false,
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    setupContextMock.mockReset();
    prepareDemoWorkspaceMock.mockReset();
    process.exitCode = undefined;
    await ctx.cleanup();
  });

  it("installs a demo dataset with demo install", async () => {
    const program = createProgram();
    registerDemoCommand(program);

    const result = await runCommand(program, ["demo", "install", "nasa"]);
    expect(result.errors).toEqual([]);
    expect(result.logs).toHaveLength(1);

    const output = JSON.parse(result.logs[0]);
    expect(output).toMatchObject({
      dataset: "nasa",
      pot: "nasa-demo",
      stored: 52,
      total: 52,
    });
    expect(prepareDemoWorkspaceMock).toHaveBeenCalledWith(
      "nasa",
      expect.objectContaining({ wsPath: ctx.wsPath }),
    );
  });
});
