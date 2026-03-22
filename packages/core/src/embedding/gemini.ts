import { GoogleGenAI } from "@google/genai";
import type { EmbedInput, EmbeddingProvider } from "./types.js";

const DEFAULT_MODEL = "gemini-embedding-2-preview";
const DEFAULT_DIMENSIONS = 3072;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const MAX_JITTER_MS = 500;
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Embedding provider backed by Google's Gemini embedding API.
 */
export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly modelId: string;
  readonly dimensions: number;
  private readonly client: GoogleGenAI;

  constructor(
    apiKey: string,
    modelId: string = DEFAULT_MODEL,
    dimensions: number = DEFAULT_DIMENSIONS,
  ) {
    this.modelId = modelId;
    this.dimensions = dimensions;
    this.client = new GoogleGenAI({ apiKey });
  }

  async embed(input: EmbedInput): Promise<Float32Array> {
    const contents = input.kind === "text"
      ? [input.text]
      : [
          {
            inlineData: {
              data: input.data.toString("base64"),
              mimeType: input.mimeType,
            },
          },
        ];

    let lastError: unknown;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay =
          BASE_DELAY_MS * Math.pow(2, attempt - 1) +
          Math.random() * MAX_JITTER_MS;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

        try {
          const response = await this.client.models.embedContent({
            model: this.modelId,
            contents,
            config: {
              taskType: input.taskType,
              outputDimensionality: this.dimensions,
              abortSignal: controller.signal,
            },
          });

          const values = response.embeddings?.[0]?.values;
          if (!values) {
            throw new Error("No embedding values returned from Gemini API");
          }

          return new Float32Array(values);
        } finally {
          clearTimeout(timeout);
        }
      } catch (error: unknown) {
        lastError = error;

        // Don't retry on abort (timeout) or non-retryable errors
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new Error(`Gemini embedding request timed out after ${TIMEOUT_MS}ms`);
        }

        // Only retry on potentially transient errors
        const isRetryable =
          error instanceof Error &&
          (error.message.includes("429") ||
            error.message.includes("500") ||
            error.message.includes("503") ||
            error.message.includes("ECONNRESET") ||
            error.message.includes("ETIMEDOUT"));

        if (!isRetryable || attempt === MAX_RETRIES) {
          throw error;
        }
      }
    }

    throw lastError;
  }
}
