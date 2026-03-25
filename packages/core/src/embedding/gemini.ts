import {
  createPartFromBase64,
  createPartFromText,
  createPartFromUri,
  createUserContent,
  GoogleGenAI,
  type Part,
} from "@google/genai";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EmbedInput, EmbedPart, EmbeddingProvider } from "./types.js";

const DEFAULT_MODEL = "gemini-embedding-2-preview";
const DEFAULT_DIMENSIONS = 3072;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const MAX_JITTER_MS = 500;
const TIMEOUT_MS = 5 * 60 * 1000;
const FILE_POLL_INTERVAL_MS = 1000;
const INLINE_MAX_BYTES = 100 * 1024 * 1024;
const INLINE_PDF_MAX_BYTES = 50 * 1024 * 1024;
const FILE_STATE_ACTIVE = "ACTIVE";
const FILE_STATE_FAILED = "FAILED";
const FILE_STATE_PROCESSING = "PROCESSING";
const FILE_STATE_UNSPECIFIED = "STATE_UNSPECIFIED";

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
    if (input.parts.length === 0) {
      throw new Error("Gemini embedding input must contain at least one part");
    }

    const prepared = await this.prepareParts(input.parts);
    const contents = [createUserContent(prepared.parts)];
    let lastError: unknown;

    try {
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
                title: input.taskType === "RETRIEVAL_DOCUMENT" ? input.title : undefined,
                outputDimensionality: this.dimensions,
                abortSignal: controller.signal,
              },
            });

            const values = response.embeddings?.[0]?.values;
            if (!values) {
              throw new Error("No embedding values returned from Gemini API");
            }

            return normalizeVector(new Float32Array(values));
          } finally {
            clearTimeout(timeout);
          }
        } catch (error: unknown) {
          lastError = error;

          if (error instanceof DOMException && error.name === "AbortError") {
            throw new Error(`Gemini embedding request timed out after ${TIMEOUT_MS}ms`);
          }

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
    } finally {
      await prepared.cleanup();
    }

    throw lastError;
  }

  private async prepareParts(
    parts: EmbedPart[],
  ): Promise<{ parts: Part[]; cleanup: () => Promise<void> }> {
    const uploadedFiles: string[] = [];
    const preparedParts: Part[] = [];
    let inlineBytes = 0;

    try {
      for (const part of parts) {
        if (part.kind === "text") {
          preparedParts.push(createPartFromText(part.text));
          continue;
        }

        if (part.kind === "file-uri") {
          preparedParts.push(createPartFromUri(part.uri, part.mimeType));
          continue;
        }

        const inlineLimit = part.mimeType === "application/pdf"
          ? INLINE_PDF_MAX_BYTES
          : INLINE_MAX_BYTES;

        if (
          part.data.length <= inlineLimit
          && inlineBytes + part.data.length <= INLINE_MAX_BYTES
        ) {
          inlineBytes += part.data.length;
          preparedParts.push(
            createPartFromBase64(part.data.toString("base64"), part.mimeType),
          );
          continue;
        }

        const uploaded = await this.uploadPart(part.data, part.mimeType);
        uploadedFiles.push(uploaded.name);
        preparedParts.push(createPartFromUri(uploaded.uri, uploaded.mimeType));
      }

      return {
        parts: preparedParts,
        cleanup: async () => {
          await this.cleanupUploadedFiles(uploadedFiles);
        },
      };
    } catch (error) {
      await this.cleanupUploadedFiles(uploadedFiles);
      throw error;
    }
  }

  private async uploadPart(
    data: Buffer,
    mimeType: string,
  ): Promise<{ name: string; uri: string; mimeType: string }> {
    const tempDir = await mkdtemp(join(tmpdir(), "clawdrive-gemini-upload-"));
    const tempPath = join(tempDir, "payload");

    try {
      await writeFile(tempPath, data);
      const uploaded = await withTimeout(
        this.client.files.upload({
          file: tempPath,
          config: { mimeType },
        }),
        TIMEOUT_MS,
        `Gemini Files API upload timed out after ${TIMEOUT_MS}ms`,
      );
      const ready = await this.waitForFileReady(uploaded.name ?? "");

      if (!ready.name || !ready.uri) {
        throw new Error("Gemini Files API did not return a usable file URI");
      }

      return {
        name: ready.name,
        uri: ready.uri,
        mimeType: ready.mimeType ?? mimeType,
      };
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private async waitForFileReady(
    name: string,
  ): Promise<{ name?: string; uri?: string; mimeType?: string; state?: string }> {
    if (!name) {
      throw new Error("Gemini Files API did not return a file name");
    }

    const start = Date.now();
    while (true) {
      if (Date.now() - start > TIMEOUT_MS) {
        throw new Error(`Gemini file processing timed out after ${TIMEOUT_MS}ms`);
      }

      const remainingMs = Math.max(TIMEOUT_MS - (Date.now() - start), 1);
      const file = await withTimeout(
        this.client.files.get({ name }),
        remainingMs,
        `Gemini file status check timed out after ${TIMEOUT_MS}ms`,
      );
      const state = normalizeFileState(file.state);

      if (state === FILE_STATE_ACTIVE) {
        return {
          name: file.name,
          uri: file.uri,
          mimeType: file.mimeType,
          state,
        };
      }

      if (state === FILE_STATE_FAILED) {
        const details = extractFileErrorMessage(file.error);
        throw new Error(
          details
            ? `Gemini file processing failed for ${name}: ${details}`
            : `Gemini file processing failed for ${name}`,
        );
      }

      if (
        state !== null
        && state !== FILE_STATE_PROCESSING
        && state !== FILE_STATE_UNSPECIFIED
      ) {
        throw new Error(`Gemini file processing entered unexpected state ${state} for ${name}`);
      }

      await new Promise((resolve) => setTimeout(resolve, FILE_POLL_INTERVAL_MS));
    }
  }

  private async cleanupUploadedFiles(uploadedFiles: string[]): Promise<void> {
    await Promise.all(
      uploadedFiles.map(async (name) => {
        try {
          await this.client.files.delete({ name });
        } catch {
          // best effort cleanup
        }
      }),
    );
  }
}

function normalizeVector(vector: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < vector.length; i++) {
    norm += vector[i] * vector[i];
  }

  if (norm === 0) {
    return vector;
  }

  const scale = 1 / Math.sqrt(norm);
  for (let i = 0; i < vector.length; i++) {
    vector[i] *= scale;
  }

  return vector;
}

function normalizeFileState(state: unknown): string | null {
  if (typeof state === "string") {
    const normalized = state.trim().toUpperCase();
    return normalized.length > 0 ? normalized : null;
  }

  if (state == null) {
    return null;
  }

  const normalized = String(state).trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

function extractFileErrorMessage(error: unknown): string | null {
  if (typeof error === "string") {
    return error;
  }

  if (!error || typeof error !== "object") {
    return null;
  }

  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.trim().length > 0 ? message : null;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}