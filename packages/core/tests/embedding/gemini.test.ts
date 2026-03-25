import { beforeEach, describe, expect, it, vi } from "vitest";

const getMock = vi.fn();
const uploadMock = vi.fn();
const deleteMock = vi.fn();
const embedContentMock = vi.fn();

vi.mock("@google/genai", () => ({
  createPartFromBase64: (data: string, mimeType: string) => ({ inlineData: { data, mimeType } }),
  createPartFromText: (text: string) => ({ text }),
  createPartFromUri: (uri: string, mimeType: string) => ({ fileData: { fileUri: uri, mimeType } }),
  createUserContent: (parts: unknown[]) => ({ role: "user", parts }),
  GoogleGenAI: class {
    readonly files = {
      upload: uploadMock,
      get: getMock,
      delete: deleteMock,
    };

    readonly models = {
      embedContent: embedContentMock,
    };
  },
}));

const { GeminiEmbeddingProvider } = await import("../../src/embedding/gemini.js");

describe("GeminiEmbeddingProvider", () => {
  beforeEach(() => {
    vi.useRealTimers();
    getMock.mockReset();
    uploadMock.mockReset();
    deleteMock.mockReset();
    embedContentMock.mockReset();
  });

  it("waits until uploaded files become ACTIVE", async () => {
    vi.useFakeTimers();
    getMock
      .mockResolvedValueOnce({ name: "files/123", state: "PROCESSING" })
      .mockResolvedValueOnce({ name: "files/123", state: "STATE_UNSPECIFIED" })
      .mockResolvedValueOnce({
        name: "files/123",
        uri: "gs://clawdrive/files/123",
        mimeType: "video/mp4",
        state: "ACTIVE",
      });

    const provider = new GeminiEmbeddingProvider("test-key");
  const readyPromise = (provider as any).waitForFileReady("files/123");
  await vi.runAllTimersAsync();
  const ready = await readyPromise;

    expect(ready).toEqual({
      name: "files/123",
      uri: "gs://clawdrive/files/123",
      mimeType: "video/mp4",
      state: "ACTIVE",
    });
    expect(getMock).toHaveBeenCalledTimes(3);
  });

  it("surfaces file processing errors from the Files API", async () => {
    getMock.mockResolvedValueOnce({
      name: "files/123",
      state: "FAILED",
      error: { message: "unsupported codec" },
    });

    const provider = new GeminiEmbeddingProvider("test-key");

    await expect((provider as any).waitForFileReady("files/123")).rejects.toThrow(
      "unsupported codec",
    );
  });
});