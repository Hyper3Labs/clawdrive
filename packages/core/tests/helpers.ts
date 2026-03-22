import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initWorkspace, resolveWorkspacePath } from "../src/workspace.js";

export async function createTestWorkspace() {
  const baseDir = await mkdtemp(join(tmpdir(), "clawdrive-test-"));
  const wsPath = resolveWorkspacePath(baseDir, "test");
  await initWorkspace(wsPath);
  return {
    baseDir,
    wsPath,
    dbPath: join(wsPath, "db"),
    filesPath: join(wsPath, "files"),
    cleanup: () => rm(baseDir, { recursive: true }),
  };
}
