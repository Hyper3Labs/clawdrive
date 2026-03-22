// packages/core/src/config.ts
import { z } from "zod";
import { readFile, writeFile, chmod } from "node:fs/promises";

export const ConfigSchema = z.object({
  version: z.number().default(1),
  gemini_api_key: z.string().optional(),
  default_workspace: z.string().default("default"),
  embedding: z.object({
    model: z.string().default("gemini-embedding-2-preview"),
    dimensions: z.number().default(3072),
  }).default({}),
  store: z.object({
    concurrency: z.number().default(3),
    fail_on_duplicate: z.boolean().default(false),
    chunk_sizes: z.object({
      pdf_pages: z.number().default(6),
      video_seconds: z.number().default(120),
      audio_seconds: z.number().default(80),
      text_tokens: z.number().default(8192),
    }).default({}),
  }).default({}),
  serve: z.object({
    port: z.number().default(7432),
    host: z.string().default("127.0.0.1"),
  }).default({}),
});

export type Config = z.infer<typeof ConfigSchema>;

export async function loadConfig(path: string): Promise<Config> {
  let raw: unknown = {};
  try {
    const content = await readFile(path, "utf-8");
    raw = JSON.parse(content);
  } catch (err: any) {
    if (err.code !== "ENOENT") throw err;
  }
  return ConfigSchema.parse(raw);
}

export async function saveConfig(path: string, config: Config): Promise<void> {
  await writeFile(path, JSON.stringify(config, null, 2));
  await chmod(path, 0o600);
}

export function resolveApiKey(envKey: string | undefined, configKey: string | undefined): string | undefined {
  return envKey ?? configKey;
}
