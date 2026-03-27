// packages/core/src/storage/files.ts
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, link, copyFile, unlink } from "node:fs/promises";
import { join } from "node:path";

/**
 * Compute SHA-256 hash of a file, returned as a hex string.
 */
export async function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

/**
 * Build a date-based subdirectory name (yyyy-mm format).
 */
function dateSubdir(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * Store a file into the workspace files directory.
 *
 * Creates a `<yyyy-mm>/` subdirectory, then tries a hard link first
 * (fast, no extra disk usage). Falls back to copyFile on error
 * (e.g. cross-device link or unsupported filesystem).
 *
 * @returns The full destination path.
 */
export async function storeFile(
  src: string,
  filesDir: string,
  id: string,
  ext: string,
): Promise<string> {
  const subdir = dateSubdir();
  const destDir = join(filesDir, subdir);
  await mkdir(destDir, { recursive: true });

  const destPath = join(destDir, `${id}${ext}`);

  try {
    await link(src, destPath);
  } catch {
    // Cross-device link or other error — fall back to copy
    await copyFile(src, destPath);
  }

  return destPath;
}

/**
 * Remove a file from the workspace.
 */
export async function removeFile(filePath: string): Promise<void> {
  await unlink(filePath);
}
