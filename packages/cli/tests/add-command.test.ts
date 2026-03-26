import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import {
  MockEmbeddingProvider,
  createPot,
  getFileInfo,
  initWorkspace,
  listFiles,
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

import { registerAddCommand } from "../src/commands/add.js";
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

describe("CLI add commands", () => {
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

  it("stores an unfiled file with cdrive add", async () => {
    const src = join(ctx.baseDir, "notes.md");
    await writeFile(src, "# Notes\n\nWorkspace-level ingest works.");

    const program = createProgram();
    registerAddCommand(program);

    const result = await runCommand(program, ["add", src]);
    expect(result.errors).toEqual([]);
    expect(result.logs).toHaveLength(1);

    const output = JSON.parse(result.logs[0]);
    expect(output).toMatchObject({
      total: 1,
      stored: 1,
      existing: 0,
      failed: 0,
    });
    expect(output).not.toHaveProperty("pot");

    const listing = await listFiles({ limit: 10 }, { wsPath: ctx.wsPath });
    expect(listing.items).toHaveLength(1);
    expect(listing.items[0]?.original_name).toBe("notes.md");
    expect(listing.items[0]?.tags).toEqual([]);
  });

  it("attaches an existing workspace file to a pot with cdrive add --pot", async () => {
    const pot = await createPot({ name: "Acme DD" }, { wsPath: ctx.wsPath });
    const src = join(ctx.baseDir, "nda.md");
    await writeFile(src, "# NDA\n\nConfidential terms.");

    const program = createProgram();
    registerAddCommand(program);

    const initial = await runCommand(program, ["add", src]);
    const initialOutput = JSON.parse(initial.logs[0]);
    const fileId = initialOutput.results[0]?.id;

    const attached = await runCommand(program, ["add", "--pot", pot.slug, src]);
    expect(attached.errors).toEqual([]);
    const attachedOutput = JSON.parse(attached.logs[0]);

    expect(attachedOutput).toMatchObject({
      pot: pot.slug,
      total: 1,
      stored: 0,
      attached: 1,
      existing: 0,
      failed: 0,
    });
    expect(attachedOutput.results[0]?.id).toBe(fileId);

    const listing = await listFiles({ limit: 10 }, { wsPath: ctx.wsPath });
    expect(listing.items).toHaveLength(1);

    const potFiles = await listPotFiles(pot.slug, { wsPath: ctx.wsPath });
    expect(potFiles).toHaveLength(1);
    expect(potFiles[0]?.id).toBe(fileId);

    const info = await getFileInfo(fileId, { wsPath: ctx.wsPath });
    expect(info?.tags).toContain(`pot:${pot.slug}`);
  });

  it("keeps cdrive pot add working as a compatibility alias", async () => {
    const pot = await createPot({ name: "Launch Docs" }, { wsPath: ctx.wsPath });
    const src = join(ctx.baseDir, "brief.md");
    await writeFile(src, "# Brief\n\nLaunch checklist.");

    const program = createProgram();
    registerPotCommand(program);

    const result = await runCommand(program, ["pot", "add", pot.slug, src]);
    expect(result.errors).toEqual([]);
    expect(result.logs).toHaveLength(1);

    const output = JSON.parse(result.logs[0]);
    expect(output).toMatchObject({
      pot: pot.slug,
      total: 1,
      stored: 1,
      attached: 0,
      existing: 0,
      failed: 0,
    });

    const potFiles = await listPotFiles(pot.slug, { wsPath: ctx.wsPath });
    expect(potFiles).toHaveLength(1);
    expect(potFiles[0]?.original_name).toBe("brief.md");
  });
});