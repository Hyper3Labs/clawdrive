import { homedir } from "node:os";
import { join } from "node:path";
import { loadConfig, resolveApiKey, resolveWorkspacePath, initWorkspace, GeminiEmbeddingProvider } from "@clawdrive/core";

export function getBaseDir(): string {
  return join(homedir(), ".clawdrive");
}

export async function setupContext(opts: { workspace: string; json?: boolean }) {
  const baseDir = getBaseDir();
  const configPath = join(baseDir, "config.json");
  const config = await loadConfig(configPath);
  const wsName = opts.workspace ?? config.default_workspace;
  const wsPath = resolveWorkspacePath(baseDir, wsName);
  await initWorkspace(wsPath);

  const apiKey = resolveApiKey(process.env.GEMINI_API_KEY, config.gemini_api_key);
  if (!apiKey) {
    console.error("Error: No Gemini API key found. Set GEMINI_API_KEY env var or run: clawdrive config set-key <key>");
    process.exit(2);
  }

  const embedder = new GeminiEmbeddingProvider(apiKey, config.embedding.model, config.embedding.dimensions);
  return { config, wsPath, embedder, baseDir };
}
