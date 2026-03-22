import { describe, it, expect } from "vitest";
import { MockEmbeddingProvider } from "../../src/embedding/mock.js";

describe("MockEmbeddingProvider", () => {
  const provider = new MockEmbeddingProvider(3072);

  it("returns a vector of correct dimensions", async () => {
    const result = await provider.embed({ kind: "text", text: "hello", taskType: "RETRIEVAL_DOCUMENT" });
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(3072);
  });

  it("returns deterministic vectors for same input", async () => {
    const a = await provider.embed({ kind: "text", text: "hello", taskType: "RETRIEVAL_DOCUMENT" });
    const b = await provider.embed({ kind: "text", text: "hello", taskType: "RETRIEVAL_DOCUMENT" });
    expect(a).toEqual(b);
  });

  it("returns different vectors for different inputs", async () => {
    const a = await provider.embed({ kind: "text", text: "hello", taskType: "RETRIEVAL_DOCUMENT" });
    const b = await provider.embed({ kind: "text", text: "world", taskType: "RETRIEVAL_DOCUMENT" });
    expect(a).not.toEqual(b);
  });

  it("handles binary input", async () => {
    const result = await provider.embed({
      kind: "binary",
      data: Buffer.from("image data"),
      mimeType: "image/png",
      taskType: "RETRIEVAL_DOCUMENT",
    });
    expect(result.length).toBe(3072);
  });
});
