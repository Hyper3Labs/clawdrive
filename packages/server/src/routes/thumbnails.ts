import { Router } from "express";
import { join } from "node:path";
import { getFileInfo, getThumbnail } from "@clawdrive/core";

export function createThumbnailRoutes(wsPath: string): Router {
  const router = Router();
  const cacheDir = join(wsPath, "thumbnails");

  // GET /api/files/:id/thumbnail
  router.get("/:id/thumbnail", async (req, res, next) => {
    try {
      const info = await getFileInfo(req.params.id, { wsPath });
      if (!info) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      const filePath = join(wsPath, "files", info.file_path);
      const thumbPath = await getThumbnail(filePath, info.content_type, cacheDir, info.id);

      if (!thumbPath) {
        res.status(500).json({ error: "Thumbnail generation failed" });
        return;
      }

      res.set("Content-Type", "image/jpeg");
      res.set("Cache-Control", "public, max-age=86400");
      const { createReadStream } = await import("node:fs");
      createReadStream(thumbPath).pipe(res);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
