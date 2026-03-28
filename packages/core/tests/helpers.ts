import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initWorkspace, resolveWorkspacePath } from "../src/workspace.js";

export async function writeSilentWav(filePath: string, durationSeconds: number = 1): Promise<void> {
  const sampleRate = 16_000;
  const channels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const frameCount = Math.max(1, Math.floor(sampleRate * durationSeconds));
  const dataSize = frameCount * channels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  await writeFile(filePath, buffer);
}

export async function writeTinyPng(filePath: string): Promise<void> {
  const pngBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yX1cAAAAASUVORK5CYII=",
    "base64",
  );
  await writeFile(filePath, pngBytes);
}

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
