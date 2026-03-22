import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { storeFile, hashFile, removeFile } from "../../src/storage/files.js";
import { createTestWorkspace } from "../helpers.js";
import { writeFile, stat } from "node:fs/promises";
import { join } from "node:path";

describe("file storage", () => {
  let ctx: Awaited<ReturnType<typeof createTestWorkspace>>;
  beforeEach(async () => { ctx = await createTestWorkspace(); });
  afterEach(async () => { await ctx.cleanup(); });

  it("hashes a file with SHA-256", async () => {
    const src = join(ctx.baseDir, "input.txt");
    await writeFile(src, "hello world");
    const hash = await hashFile(src);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("copies file to workspace files dir", async () => {
    const src = join(ctx.baseDir, "input.txt");
    await writeFile(src, "hello world");
    const destPath = await storeFile(src, ctx.filesPath, "test-id", ".txt");
    const s = await stat(destPath);
    expect(s.isFile()).toBe(true);
  });

  it("removes file from workspace", async () => {
    const src = join(ctx.baseDir, "input.txt");
    await writeFile(src, "hello world");
    const destPath = await storeFile(src, ctx.filesPath, "test-id", ".txt");
    await removeFile(destPath);
    await expect(stat(destPath)).rejects.toThrow();
  });
});
