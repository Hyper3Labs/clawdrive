import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";

const execFileAsync = promisify(execFile);

const SUPPORTED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg"]);
const SUPPORTED_AUDIO_MIME_TYPES = new Set(["audio/mpeg", "audio/wav"]);
const SUPPORTED_VIDEO_MIME_TYPES = new Set(["video/mp4", "video/quicktime"]);

export interface PreparedMedia {
  data: Buffer;
  mimeType: string;
}

export function isEmbeddableMediaType(mimeType: string): boolean {
  return (
    mimeType === "application/pdf" ||
    mimeType.startsWith("image/") ||
    mimeType.startsWith("audio/") ||
    mimeType.startsWith("video/")
  );
}

export async function prepareImageFileForEmbedding(
  filePath: string,
  mimeType: string,
): Promise<PreparedMedia> {
  const data = await readFile(filePath);
  return prepareImageBufferForEmbedding(data, mimeType);
}

export async function prepareBinaryForEmbedding(
  data: Buffer,
  mimeType: string,
): Promise<PreparedMedia> {
  if (mimeType === "application/pdf") {
    return { data, mimeType };
  }

  if (mimeType.startsWith("image/")) {
    return prepareImageBufferForEmbedding(data, mimeType);
  }

  if (mimeType.startsWith("audio/")) {
    return prepareAudioForEmbedding(data, mimeType);
  }

  if (mimeType.startsWith("video/")) {
    return prepareVideoForEmbedding(data, mimeType);
  }

  throw new Error(`Unsupported binary content type for embeddings: ${mimeType}`);
}

async function prepareImageBufferForEmbedding(
  data: Buffer,
  mimeType: string,
): Promise<PreparedMedia> {
  if (SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) {
    return { data, mimeType };
  }

  const normalized = await sharp(data, { animated: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 90 })
    .toBuffer();

  return { data: normalized, mimeType: "image/jpeg" };
}

async function prepareAudioForEmbedding(
  data: Buffer,
  mimeType: string,
): Promise<PreparedMedia> {
  if (SUPPORTED_AUDIO_MIME_TYPES.has(mimeType)) {
    return { data, mimeType };
  }

  return transcodeWithFfmpeg(data, mimeType, {
    outputExtension: "mp3",
    outputMimeType: "audio/mpeg",
    args: ["-vn", "-codec:a", "libmp3lame", "-q:a", "4"],
  });
}

async function prepareVideoForEmbedding(
  data: Buffer,
  mimeType: string,
): Promise<PreparedMedia> {
  if (SUPPORTED_VIDEO_MIME_TYPES.has(mimeType)) {
    return { data, mimeType };
  }

  return transcodeWithFfmpeg(data, mimeType, {
    outputExtension: "mp4",
    outputMimeType: "video/mp4",
    args: [
      "-an",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
    ],
  });
}

async function transcodeWithFfmpeg(
  data: Buffer,
  inputMimeType: string,
  opts: {
    outputExtension: string;
    outputMimeType: string;
    args: string[];
  },
): Promise<PreparedMedia> {
  const tempDir = await mkdtemp(join(tmpdir(), "clawdrive-embed-"));
  const inputPath = join(tempDir, `input${extensionForMimeType(inputMimeType)}`);
  const outputPath = join(tempDir, `output.${opts.outputExtension}`);

  try {
    await writeFile(inputPath, data);
    await execFileAsync(
      "ffmpeg",
      ["-hide_banner", "-loglevel", "error", "-i", inputPath, ...opts.args, "-y", outputPath],
      { timeout: 30_000 },
    );
    const transcoded = await readFile(outputPath);
    return { data: transcoded, mimeType: opts.outputMimeType };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function extensionForMimeType(mimeType: string): string {
  switch (mimeType) {
    case "application/pdf":
      return ".pdf";
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    case "image/gif":
      return ".gif";
    case "image/webp":
      return ".webp";
    case "image/svg+xml":
      return ".svg";
    case "audio/mpeg":
      return ".mp3";
    case "audio/wav":
      return ".wav";
    case "audio/ogg":
      return ".ogg";
    case "audio/mp4":
      return ".m4a";
    case "video/mp4":
      return ".mp4";
    case "video/mpeg":
      return ".mpeg";
    case "video/quicktime":
      return ".mov";
    case "video/webm":
      return ".webm";
    default:
      return ".bin";
  }
}