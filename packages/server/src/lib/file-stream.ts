import type { Response } from "express";
import { createReadStream, statSync } from "node:fs";

export function streamFilePath(filePath: string, contentType: string, res: Response): boolean {
  try {
    const stats = statSync(filePath);
    res.set("Content-Type", contentType);
    res.set("Content-Length", String(stats.size));
    createReadStream(filePath).pipe(res);
    return true;
  } catch {
    res.status(404).json({ error: "File not on disk" });
    return false;
  }
}