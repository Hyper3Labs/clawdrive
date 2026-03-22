import { createHash } from "node:crypto";
import type { EmbedInput, EmbeddingProvider } from "./types.js";

/**
 * A deterministic mock embedding provider for testing.
 * Generates reproducible vectors from input content using SHA-256 hashing.
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly modelId = "mock";
  readonly dimensions: number;

  constructor(dimensions: number) {
    this.dimensions = dimensions;
  }

  async embed(input: EmbedInput): Promise<Float32Array> {
    const content = input.kind === "text" ? input.text : input.data;
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
