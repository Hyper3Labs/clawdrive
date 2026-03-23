import { homedir } from "node:os";
import { join } from "node:path";
import { loadConfig, resolveApiKey, resolveWorkspacePath, initWorkspace, GeminiEmbeddingProvider } from "@clawdrive/core";

export interface GlobalCliOptions {
  workspace: string;
  json?: boolean;
}

export function getBaseDir(): string {
  return join(homedir(), ".clawdrive");
}

export function getGlobalOptions(cmd: {
  optsWithGlobals?: () => Record<string, unknown>;
  parent?: { opts?: () => Record<string, unknown> };
}): GlobalCliOptions {
  if (typeof cmd.optsWithGlobals === "function") {
    return cmd.optsWithGlobals() as unknown as GlobalCliOptions;
  }
  return (cmd.parent?.opts?.() ?? {}) as unknown as GlobalCliOptions;
}

export async function setupWorkspaceContext(opts: { workspace: string; json?: boolean }) {
  const baseDir = getBaseDir();
  const configPath = join(baseDir, "config.json");
  const config = await loadConfig(configPath);
  const wsName = opts.workspace ?? config.default_workspace;
  const wsPath = resolveWorkspacePath(baseDir, wsName);
  await initWorkspace(wsPath);

  return { config, wsPath, baseDir };
}

export async function setupContext(opts: { workspace: string; json?: boolean }) {
  const { config, wsPath, baseDir } = await setupWorkspaceContext(opts);

  const apiKey = resolveApiKey(process.env.GEMINI_API_KEY, config.gemini_api_key);
  if (!apiKey) {
    console.error("Error: No Gemini API key found. Set GEMINI_API_KEY or add gemini_api_key to ~/.clawdrive/config.json");
    process.exit(2);
  }

  const embedder = new GeminiEmbeddingProvider(apiKey, config.embedding.model, config.embedding.dimensions);
  return { config, wsPath, embedder, baseDir };
}
