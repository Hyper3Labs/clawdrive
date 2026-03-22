import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initWorkspace, resolveWorkspacePath } from "../src/workspace.js";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("workspace", () => {
  let baseDir: string;
  beforeEach(async () => { baseDir = await mkdtemp(join(tmpdir(), "clawdrive-ws-")); });
  afterEach(async () => { await rm(baseDir, { recursive: true }); });

  it("resolves default workspace path", () => {
    const path = resolveWorkspacePath(baseDir, "default");
    expect(path).toBe(join(baseDir, "workspaces", "default"));
  });

  it("initializes workspace directories", async () => {
    const wsPath = resolveWorkspacePath(baseDir, "default");
    await initWorkspace(wsPath);
    const dbStat = await stat(join(wsPath, "db"));
    expect(dbStat.isDirectory()).toBe(true);
    const filesStat = await stat(join(wsPath, "files"));
    expect(filesStat.isDirectory()).toBe(true);
  });

  it("sets 700 permissions on workspace dir", async () => {
    const wsPath = resolveWorkspacePath(baseDir, "test");
    await initWorkspace(wsPath);
    const s = await stat(wsPath);
    expect(s.mode & 0o777).toBe(0o700);
  });
});
