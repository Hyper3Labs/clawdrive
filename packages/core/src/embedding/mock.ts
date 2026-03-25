import { createHash } from "node:crypto";
import type { EmbedInput, EmbeddingProvider } from "./types.js";

/**
 * A deterministic mock embedding provider for testing.
 * Generates reproducible vectors from input content using SHA-256 hashing.
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly modelId: string;
  readonly dimensions: number;

  constructor(dimensions: number, modelId: string = "mock") {
    this.dimensions = dimensions;
    this.modelId = modelId;
  }

  async embed(input: EmbedInput): Promise<Float32Array> {
    const content = await serializeInput(input);
    const seed = createHash("sha256").update(content).digest();

    const vector = new Float32Array(this.dimensions);

    // Use the 32-byte hash to seed a simple PRNG (xorshift32)
    // to fill the entire vector deterministically.
    let state = seed.readUInt32BE(0) | 1; // ensure non-zero
    for (let i = 0; i < this.dimensions; i++) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      // Map to [-1, 1] range
      vector[i] = (state >>> 0) / 0xffffffff * 2 - 1;
    }

    // Normalize to unit length (L2 norm)
    let norm = 0;
    for (let i = 0; i < this.dimensions; i++) {
      norm += vector[i] * vector[i];
    }
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < this.dimensions; i++) {
        vector[i] /= norm;
      }
    }

    return vector;
  }
}

async function serializeInput(input: EmbedInput): Promise<Buffer> {
  const serializedParts = await Promise.all(
    input.parts.map(async (part) => {
      if (part.kind === "text") {
        return `text:${part.text}`;
      }

      if (part.kind === "file-uri") {
        return `file-uri:${part.mimeType}:${part.uri}`;
      }

      return Buffer.concat([
        Buffer.from(`inline-data:${part.mimeType}:`, "utf8"),
        part.data,
      ]);
    }),
  );

  return Buffer.concat([
    Buffer.from(`task:${input.taskType}:title:${input.title ?? ""}:`, "utf8"),
    ...serializedParts.map((part) =>
      typeof part === "string" ? Buffer.from(`${part}|`, "utf8") : Buffer.concat([part, Buffer.from("|", "utf8")]),
    ),
  ]);
}
