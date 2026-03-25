const EXTENSION_MAP: Record<string, string> = {
  // Documents
  ".pdf": "application/pdf",

  // Images
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",

  // Video
  ".mp4": "video/mp4",
  ".mpeg": "video/mpeg",
  ".mov": "video/quicktime",
  ".webm": "video/webm",

  // Audio
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",

  // Text / markup
  ".md": "text/markdown",
  ".txt": "text/plain",
  ".json": "application/json",
  ".yaml": "text/yaml",
  ".yml": "text/yaml",

  // Code
  ".ts": "text/typescript",
  ".tsx": "text/typescript",
  ".js": "text/javascript",
  ".jsx": "text/javascript",
  ".py": "text/x-python",
  ".rs": "text/x-rust",
  ".go": "text/x-go",

  // Web
  ".html": "text/html",
  ".css": "text/css",
  ".xml": "text/xml",
};

/**
 * Detect MIME type from a filename using its extension.
 * Falls back to `application/octet-stream` for unknown extensions.
 */
export function detectMimeType(filename: string): string {
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex === -1) return "application/octet-stream";

  const ext = filename.slice(dotIndex).toLowerCase();
  return EXTENSION_MAP[ext] ?? "application/octet-stream";
}

/**
 * Select the appropriate chunker strategy for a given MIME type.
 */
export function selectChunker(
  mimeType: string,
): "text" | "pdf" | "video" | "audio" | "none" {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (
    mimeType.startsWith("text/") ||
    mimeType === "application/json"
  )
    return "text";
  if (mimeType.startsWith("image/")) return "none";
  return "none";
}
