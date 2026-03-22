import { execFile } from "node:child_process";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Chunk, ChunkOptions } from "./types.js";

const execFileAsync = promisify(execFile);

/**
 * Format seconds into a human-readable time label (e.g., "0:00-2:00").
 */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Detect the MIME type of a video file based on its extension.
 */
function detectVideoMime(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "mp4":
    case "mpeg":
      return "video/mp4";
    case "mov":
      return "video/quicktime";
    case "webm":
      return "video/webm";
    default:
      return "video/mp4";
  }
}

/**
 * Split a video file into segments of `videoSeconds` duration each.
 *
 * Uses ffprobe to detect duration and ffmpeg to split via stream copy.
 * Requires ffmpeg/ffprobe to be installed on the system.
 *
 * If the video is shorter than `videoSeconds`, returns a single chunk
 * with label "full".
 */
export async function chunkVideo(
  filePath: string,
  opts: ChunkOptions = {},
): Promise<Chunk[]> {
  const segmentDuration = opts.videoSeconds ?? 120;
  const mimeType = detectVideoMime(filePath);

  // Probe duration
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    filePath,
  ]);
  const totalDuration = parseFloat(stdout.trim());

  if (totalDuration <= segmentDuration) {
    const data = await readFile(filePath);
    return [{ index: 0, label: "full", data: Buffer.from(data), mimeType }];
  }

  const tmpDir = await mkdtemp(join(tmpdir(), "clawdrive-video-"));
  const chunks: Chunk[] = [];

  try {
    let chunkIndex = 0;
    for (let start = 0; start < totalDuration; start += segmentDuration) {
      const duration = Math.min(segmentDuration, totalDuration - start);
      const ext = filePath.split(".").pop() ?? "mp4";
      const outPath = join(tmpDir, `segment_${chunkIndex}.${ext}`);

      await execFileAsync("ffmpeg", [
        "-i",
        filePath,
        "-ss",
        start.toString(),
        "-t",
        duration.toString(),
        "-c",
        "copy",
        "-y",
        outPath,
      ]);

      const data = await readFile(outPath);
      const endTime = Math.min(start + segmentDuration, totalDuration);
      const label = `${formatTime(start)}-${formatTime(endTime)}`;

      chunks.push({
        index: chunkIndex++,
        label,
        data: Buffer.from(data),
        mimeType,
      });
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }

  return chunks;
}
