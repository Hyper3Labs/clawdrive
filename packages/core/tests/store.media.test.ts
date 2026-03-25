import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EmbedInput, EmbeddingProvider } from "../src/embedding/types.js";
import { createTestWorkspace } from "./helpers.js";

const chunkAudioMock = vi.fn();
const chunkVideoMock = vi.fn();
const prepareBinaryForEmbeddingMock = vi.fn(
  async (data: Buffer, mimeType: string): Promise<{ data: Buffer; mimeType: string }> => {
    if (mimeType.startsWith("audio/")) {
      return { data: Buffer.from("normalized-audio"), mimeType: "audio/mpeg" };
    }

    if (mimeType.startsWith("video/")) {
      return { data: Buffer.from("normalized-video"), mimeType: "video/mp4" };
    }

    return { data, mimeType };
  },
);

vi.mock("../src/chunker/audio.js", () => ({
  chunkAudio: chunkAudioMock,
}));

vi.mock("../src/chunker/video.js", () => ({
  chunkVideo: chunkVideoMock,
}));

vi.mock("../src/embedding/media.js", async () => {
  const actual = await vi.importActual<typeof import("../src/embedding/media.js")>("../src/embedding/media.js");
  return {
    ...actual,
    prepareBinaryForEmbedding: prepareBinaryForEmbeddingMock,
  };
});

const { store } = await import("../src/store.js");

class CapturingEmbedder implements EmbeddingProvider {
  readonly modelId = "capture-model";
  readonly dimensions = 3072;
  readonly inputs: EmbedInput[] = [];

  async embed(input: EmbedInput): Promise<Float32Array> {
    this.inputs.push(input);
    const vector = new Float32Array(this.dimensions);
    vector[0] = 1;
    return vector;
  }
}

describe("store media normalization", () => {
  let ctx: Awaited<ReturnType<typeof createTestWorkspace>>;

  beforeEach(async () => {
    ctx = await createTestWorkspace();
    chunkAudioMock.mockReset();
    chunkVideoMock.mockReset();
    prepareBinaryForEmbeddingMock.mockClear();
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("normalizes audio chunks before embedding", async () => {
    const src = join(ctx.baseDir, "voice.m4a");
    const embedder = new CapturingEmbedder();

    await writeFile(src, Buffer.from("source-audio"));
    chunkAudioMock.mockResolvedValueOnce([
      { index: 0, label: "full", data: Buffer.from("chunk-audio"), mimeType: "audio/mp4" },
    ]);

    await store({ sourcePath: src }, { wsPath: ctx.wsPath, embedder });

    expect(prepareBinaryForEmbeddingMock).toHaveBeenCalledWith(expect.any(Buffer), "audio/mp4");
    const part = embedder.inputs[0]?.parts[0];

    expect(part?.kind).toBe("inline-data");
    if (part?.kind !== "inline-data") {
      throw new Error("expected inline data part");
    }

    expect(part.mimeType).toBe("audio/mpeg");
  });

  it("normalizes video chunks before embedding", async () => {
    const src = join(ctx.baseDir, "clip.webm");
    const embedder = new CapturingEmbedder();

    await writeFile(src, Buffer.from("source-video"));
    chunkVideoMock.mockResolvedValueOnce([
      { index: 0, label: "full", data: Buffer.from("chunk-video"), mimeType: "video/webm" },
    ]);

    await store({ sourcePath: src }, { wsPath: ctx.wsPath, embedder });

    expect(prepareBinaryForEmbeddingMock).toHaveBeenCalledWith(expect.any(Buffer), "video/webm");
    const part = embedder.inputs[0]?.parts[0];

    expect(part?.kind).toBe("inline-data");
    if (part?.kind !== "inline-data") {
      throw new Error("expected inline data part");
    }

    expect(part.mimeType).toBe("video/mp4");
  });
});