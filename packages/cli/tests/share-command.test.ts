import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import {
  MockEmbeddingProvider,
  createPot,
  createPotShare,
  approveShare,
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

import { registerShareCommand } from "../src/commands/share.js";

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

describe("CLI share commands", () => {
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

  async function seedPotWithFile(potName: string) {
    const pot = await createPot({ name: potName }, { wsPath: ctx.wsPath });
    const src = join(ctx.baseDir, `${pot.slug}-file.md`);
    await writeFile(src, `# ${potName}\n\nContent for sharing.`);
    await store(
      { sourcePath: src, tags: [`pot:${pot.slug}`] },
      { wsPath: ctx.wsPath, embedder },
    );
    return pot;
  }

  it("creates a link share for a pot", async () => {
    const pot = await seedPotWithFile("Share Test");

    const program = createProgram();
    registerShareCommand(program);

    const result = await runCommand(program, ["share", "pot", pot.slug, "--link"]);
    expect(result.errors).toEqual([]);
    expect(result.logs).toHaveLength(1);

    const output = JSON.parse(result.logs[0]);
    expect(output).toHaveProperty("id");
    expect(output).toHaveProperty("token");
    expect(output.token).toBeTruthy();
    expect(output.kind).toBe("link");
    expect(output.status).toBe("pending");
    expect(output.pot_slug).toBe(pot.slug);
  });

  it("approves a pending share", async () => {
    const pot = await seedPotWithFile("Approve Test");
    const share = await createPotShare(
      { pot: pot.slug, kind: "link", role: "read" },
      { wsPath: ctx.wsPath },
    );

    const program = createProgram();
    registerShareCommand(program);

    const result = await runCommand(program, ["share", "approve", share.id]);
    expect(result.errors).toEqual([]);
    expect(result.logs).toHaveLength(1);

    const output = JSON.parse(result.logs[0]);
    expect(output.id).toBe(share.id);
    expect(output.status).toBe("active");
  });

  it("revokes an active share", async () => {
    const pot = await seedPotWithFile("Revoke Test");
    const share = await createPotShare(
      { pot: pot.slug, kind: "link", role: "read" },
      { wsPath: ctx.wsPath },
    );
    await approveShare(share.id, { wsPath: ctx.wsPath });

    const program = createProgram();
    registerShareCommand(program);

    const result = await runCommand(program, ["share", "revoke", share.id]);
    expect(result.errors).toEqual([]);
    expect(result.logs).toHaveLength(1);

    const output = JSON.parse(result.logs[0]);
    expect(output.id).toBe(share.id);
    expect(output.status).toBe("revoked");
  });

  it("lists pending shares in the inbox", async () => {
    const pot = await seedPotWithFile("Inbox Test");
    await createPotShare(
      { pot: pot.slug, kind: "link", role: "read" },
      { wsPath: ctx.wsPath },
    );

    const program = createProgram();
    registerShareCommand(program);

    const result = await runCommand(program, ["share", "inbox"]);
    expect(result.errors).toEqual([]);
    expect(result.logs).toHaveLength(1);

    const output = JSON.parse(result.logs[0]);
    expect(Array.isArray(output)).toBe(true);
    expect(output.length).toBeGreaterThanOrEqual(1);
    expect(output[0]).toHaveProperty("id");
    expect(output[0].status).toBe("pending");
    expect(output[0].pot_slug).toBe(pot.slug);
  });
});
