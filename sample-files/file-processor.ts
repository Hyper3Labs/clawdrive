import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { extname } from "path";

interface ProcessedFile {
  hash: string;
  mimeType: string;
  chunks: string[];
  metadata: Record<string, unknown>;
}

const MIME_MAP: Record<string, string> = {
  ".pdf": "application/pdf",
  ".md": "text/markdown",
  ".txt": "text/plain",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
};

export async function processFile(path: string): Promise<ProcessedFile> {
  const buffer = await readFile(path);
  const hash = createHash("sha256").update(buffer).digest("hex");
  const ext = extname(path).toLowerCase();
  const mimeType = MIME_MAP[ext] ?? "application/octet-stream";

  const chunks = splitIntoChunks(buffer.toString("utf-8"), 1000, 200);

  return {
    hash,
    mimeType,
    chunks,
    metadata: {
      size: buffer.length,
      extension: ext,
      processedAt: new Date().toISOString(),
    },
  };
}

function splitIntoChunks(
  text: string,
  maxSize: number,
  overlap: number
): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + maxSize));
    start += maxSize - overlap;
  }
  return chunks;
}
