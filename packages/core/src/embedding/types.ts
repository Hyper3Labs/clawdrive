import type { TaskType } from "../types.js";

export type EmbedPart =
  | { kind: "text"; text: string }
  | { kind: "inline-data"; data: Buffer; mimeType: string }
  | { kind: "file-uri"; uri: string; mimeType: string };

export interface EmbedInput {
  parts: EmbedPart[];
  taskType: TaskType;
  title?: string;
}

export interface EmbeddingProvider {
  embed(input: EmbedInput): Promise<Float32Array>;
  readonly modelId: string;
  readonly dimensions: number;
}
