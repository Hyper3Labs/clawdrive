// packages/core/src/workspace.ts
import { mkdir, chmod } from "node:fs/promises";
import { join } from "node:path";

export function resolveWorkspacePath(baseDir: string, name: string): string {
  return join(baseDir, "workspaces", name);
}

export async function initWorkspace(wsPath: string): Promise<void> {
  await mkdir(join(wsPath, "db"), { recursive: true });
  await mkdir(join(wsPath, "files"), { recursive: true });
  await mkdir(join(wsPath, "projections"), { recursive: true });
  await chmod(wsPath, 0o700);
}
