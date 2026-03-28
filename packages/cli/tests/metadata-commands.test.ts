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
import { registerCaptionCommand } from "../src/commands/caption.js";
import { registerTranscriptCommand } from "../src/commands/transcript.js";
import { registerTldrCommand } from "../src/commands/tldr.js";
import { registerDigestCommand } from "../src/commands/digest.js";
import { registerRenameCommand } from "../src/commands/rename.js";

async function writeSilentWav(filePath: string, durationSeconds: number = 1) {
  const sampleRate = 16_000;
  const channels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const frameCount = Math.max(1, Math.floor(sampleRate * durationSeconds));
  const dataSize = frameCount * channels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  await writeFile(filePath, buffer);
}

async function writeTinyPng(filePath: string) {
  const pngBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yX1cAAAAASUVORK5CYII=",
    "base64",
  );
  await writeFile(filePath, pngBytes);
}

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

  it("filters todo items by --kind transcript", async () => {
    const mediaPath = join(ctx.baseDir, "recording.wav");
    await writeSilentWav(mediaPath);
    await store({ sourcePath: mediaPath, originalName: "recording.wav" }, { wsPath: ctx.wsPath, embedder });

    const program = createProgram();
    registerTodoCommand(program);

    const result = await runCommand(program, ["todo", "--kind", "transcript"]);
    expect(result.errors).toEqual([]);

    const output = JSON.parse(result.logs[0]);
    expect(output.items).toHaveLength(1);
    expect(output.items[0].missing).toEqual(["transcript"]);
  });

  it("filters todo items by --kind caption", async () => {
    const imagePath = join(ctx.baseDir, "photo.png");
    await writeTinyPng(imagePath);
    await store({ sourcePath: imagePath, originalName: "photo.png" }, { wsPath: ctx.wsPath, embedder });

    const program = createProgram();
    registerTodoCommand(program);

    const result = await runCommand(program, ["todo", "--kind", "caption"]);
    expect(result.errors).toEqual([]);

    const output = JSON.parse(result.logs[0]);
    expect(output.items).toHaveLength(1);
    expect(output.items[0].missing).toEqual(["caption"]);
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

  // --- transcript command ---

  it("sets a transcript with --set", async () => {
    const src = join(ctx.baseDir, "call.wav");
    await writeSilentWav(src);
    const storeResult = await store({ sourcePath: src, originalName: "call.wav" }, { wsPath: ctx.wsPath, embedder });

    const program = createProgram();
    registerTranscriptCommand(program);

    const result = await runCommand(program, ["transcript", storeResult.id, "--set", "Speaker 1: Hello there."]);
    expect(result.errors).toEqual([]);
    expect(result.logs).toHaveLength(1);

    const output = JSON.parse(result.logs[0]);
    expect(output.transcript.transcript).toBe("Speaker 1: Hello there.");
  });

  it("sets a transcript with --set-file", async () => {
    const src = join(ctx.baseDir, "meeting.wav");
    const transcriptFile = join(ctx.baseDir, "meeting.txt");
    await writeSilentWav(src);
    await writeFile(transcriptFile, "Speaker 1: From file transcript.");
    const storeResult = await store({ sourcePath: src, originalName: "meeting.wav" }, { wsPath: ctx.wsPath, embedder });

    const program = createProgram();
    registerTranscriptCommand(program);

    const result = await runCommand(program, ["transcript", storeResult.id, "--set-file", transcriptFile]);
    expect(result.errors).toEqual([]);

    const output = JSON.parse(result.logs[0]);
    expect(output.transcript.transcript).toBe("Speaker 1: From file transcript.");
  });

  it("rejects transcript updates for non-media files", async () => {
    const storeResult = await storeTestFile("notes.md", "plain text");

    const program = createProgram();
    registerTranscriptCommand(program);

    const result = await runCommand(program, ["transcript", storeResult.id, "--set", "Should fail"]);
    expect(result.logs).toEqual([]);
    expect(result.errors[0]).toContain("audio/video");
  });

  // --- caption command ---

  it("sets a caption with --set", async () => {
    const src = join(ctx.baseDir, "photo.png");
    await writeTinyPng(src);
    const storeResult = await store({ sourcePath: src, originalName: "photo.png" }, { wsPath: ctx.wsPath, embedder });

    const program = createProgram();
    registerCaptionCommand(program);

    const result = await runCommand(program, ["caption", storeResult.id, "--set", "A tiny transparent image fixture."]);
    expect(result.errors).toEqual([]);
    expect(result.logs).toHaveLength(1);

    const output = JSON.parse(result.logs[0]);
    expect(output.caption.caption).toBe("A tiny transparent image fixture.");
  });

  it("sets a caption with --set-file", async () => {
    const src = join(ctx.baseDir, "photo-file.png");
    const captionFile = join(ctx.baseDir, "photo.txt");
    await writeTinyPng(src);
    await writeFile(captionFile, "A caption loaded from a file.");
    const storeResult = await store({ sourcePath: src, originalName: "photo-file.png" }, { wsPath: ctx.wsPath, embedder });

    const program = createProgram();
    registerCaptionCommand(program);

    const result = await runCommand(program, ["caption", storeResult.id, "--set-file", captionFile]);
    expect(result.errors).toEqual([]);

    const output = JSON.parse(result.logs[0]);
    expect(output.caption.caption).toBe("A caption loaded from a file.");
  });

  it("rejects caption updates for non-image files", async () => {
    const storeResult = await storeTestFile("notes-2.md", "plain text");

    const program = createProgram();
    registerCaptionCommand(program);

    const result = await runCommand(program, ["caption", storeResult.id, "--set", "Should fail"]);
    expect(result.logs).toEqual([]);
    expect(result.errors[0]).toContain("image files");
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
