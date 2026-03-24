import sharp from "sharp";
import { join } from "node:path";
import { mkdir, access, constants } from "node:fs/promises";

const THUMB_WIDTH = 200;
const THUMB_HEIGHT = 200;

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function cachePath(cacheDir: string, fileId: string): string {
  return join(cacheDir, `${fileId}.jpg`);
}

/** Get or generate a thumbnail. Returns the path to the JPEG thumbnail. */
export async function getThumbnail(
  srcPath: string,
  contentType: string,
  cacheDir: string,
  fileId: string,
): Promise<string | null> {
  const dest = cachePath(cacheDir, fileId);

  if (await fileExists(dest)) return dest;

  return generateThumbnail(srcPath, contentType, cacheDir, fileId);
}

/** Generate a thumbnail and write it to cacheDir. Returns path to JPEG. */
export async function generateThumbnail(
  srcPath: string,
  contentType: string,
  cacheDir: string,
  fileId: string,
): Promise<string | null> {
  await mkdir(cacheDir, { recursive: true });
  const dest = cachePath(cacheDir, fileId);

  const kind = getPreviewKind(contentType);

  try {
    switch (kind) {
      case "image":
        await sharp(srcPath)
          .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toFile(dest);
        return dest;

      case "video":
        return await generateVideoThumbnail(srcPath, dest);

      case "pdf":
        return await generatePdfThumbnail(srcPath, dest);

      case "audio":
        return await generatePlaceholder(dest, "#F6C177", "AUD");

      case "text":
        return await generatePlaceholder(dest, "#9AD1FF", "TXT");

      default:
        return await generatePlaceholder(dest, "#6B8A9E", "FILE");
    }
  } catch (err) {
    console.error(`Thumbnail generation failed for ${fileId}:`, err);
    try {
      return await generatePlaceholder(dest, "#6B8A9E", "FILE");
    } catch {
      return null;
    }
  }
}

function getPreviewKind(contentType: string): string {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("audio/")) return "audio";
  if (contentType.startsWith("application/pdf")) return "pdf";
  if (contentType.startsWith("text/")) return "text";
  return "unknown";
}

async function generateVideoThumbnail(srcPath: string, dest: string): Promise<string | null> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);

  try {
    await execFileAsync("ffmpeg", [
      "-i", srcPath,
      "-ss", "1",
      "-vframes", "1",
      "-vf", `scale=${THUMB_WIDTH}:-1`,
      "-y",
      dest,
    ], { timeout: 10_000 });
    return dest;
  } catch {
    return generatePlaceholder(dest, "#C792EA", "VID");
  }
}

async function generatePdfThumbnail(srcPath: string, dest: string): Promise<string | null> {
  try {
    await sharp(srcPath, { page: 0 })
      .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: "inside" })
      .jpeg({ quality: 80 })
      .toFile(dest);
    return dest;
  } catch {
    return generatePlaceholder(dest, "#8AB4FF", "PDF");
  }
}

async function generatePlaceholder(dest: string, color: string, label: string): Promise<string> {
  const width = THUMB_WIDTH;
  const height = THUMB_HEIGHT;

  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);

  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="bg" cx="50%" cy="40%">
        <stop offset="0%" stop-color="rgb(${Math.round(r * 0.2)},${Math.round(g * 0.2)},${Math.round(b * 0.2)})"/>
        <stop offset="100%" stop-color="#0a131c"/>
      </radialGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg)"/>
    <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle"
      font-family="sans-serif" font-size="32" font-weight="700"
      fill="${color}" opacity="0.8">${label}</text>
  </svg>`;

  await sharp(Buffer.from(svg))
    .jpeg({ quality: 80 })
    .toFile(dest);

  return dest;
}
