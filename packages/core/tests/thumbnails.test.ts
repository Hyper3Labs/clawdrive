import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { generateThumbnail, getThumbnail } from "../src/thumbnails.js";

describe("thumbnails", () => {
  let tempDir: string;
  let cacheDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "thumb-test-"));
    cacheDir = join(tempDir, "thumbnails");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("generateThumbnail", () => {
    it("generates a JPEG thumbnail for an image file", async () => {
      const sharp = (await import("sharp")).default;
      const srcPath = join(tempDir, "test.png");
      await sharp({
        create: { width: 400, height: 300, channels: 3, background: { r: 255, g: 0, b: 0 } },
      }).png().toFile(srcPath);

      const result = await generateThumbnail(srcPath, "image/png", cacheDir, "test-id");

      expect(result).not.toBeNull();
      const bytes = await readFile(result!);
      expect(bytes[0]).toBe(0xff);
      expect(bytes[1]).toBe(0xd8); // JPEG magic bytes
    });

    it("returns a fallback placeholder for unsupported types", async () => {
      const srcPath = join(tempDir, "test.bin");
      await writeFile(srcPath, Buffer.alloc(100));

      const result = await generateThumbnail(srcPath, "application/octet-stream", cacheDir, "test-id");

      expect(result).not.toBeNull();
      const bytes = await readFile(result!);
      expect(bytes[0]).toBe(0xff);
      expect(bytes[1]).toBe(0xd8);
    });

    it("resizes large images to max 200px width", async () => {
      const sharp = (await import("sharp")).default;
      const srcPath = join(tempDir, "big.png");
      await sharp({
        create: { width: 1000, height: 800, channels: 3, background: { r: 0, g: 0, b: 255 } },
      }).png().toFile(srcPath);

      const result = await generateThumbnail(srcPath, "image/png", cacheDir, "big-id");
      const meta = await sharp(result!).metadata();
      expect(meta.width).toBeLessThanOrEqual(200);
      expect(meta.height).toBeLessThanOrEqual(200);
    });
  });

  describe("getThumbnail", () => {
    it("returns cached thumbnail on second call", async () => {
      const sharp = (await import("sharp")).default;
      const srcPath = join(tempDir, "cached.png");
      await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 255, b: 0 } },
      }).png().toFile(srcPath);

      const first = await getThumbnail(srcPath, "image/png", cacheDir, "cached-id");
      const second = await getThumbnail(srcPath, "image/png", cacheDir, "cached-id");

      expect(first).toBe(second);
    });
  });
});
