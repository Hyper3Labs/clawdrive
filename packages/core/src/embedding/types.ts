import type { TaskType } from "../types.js";

export type EmbedInput =
  | { kind: "text"; text: string; taskType: TaskType }
  | { kind: "binary"; data: Buffer; mimeType: string; taskType: TaskType };

export interface EmbeddingProvider {
  embed(input: EmbedInput): Promise<Float32Array>;
  readonly modelId: string;
  readonly dimensions: number;
}
