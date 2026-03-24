import { Router } from "express";
import type { Response } from "express";
import multer from "multer";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { EmbeddingProvider } from "@clawdrive/core";
import {
  store,
  getFileInfo,
  listFiles,
  update,
  remove,
} from "@clawdrive/core";

const UPLOAD_DIR = "/tmp/clawdrive-uploads/";
mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({ dest: UPLOAD_DIR });

function parseTags(raw: unknown): string[] {
  if (!raw) return [];
  if (typeof raw === "string") {
    // Try JSON array first
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Fall through to comma-separated
    }
    return raw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  if (Array.isArray(raw)) return raw;
  return [];
}

async function streamFileById(wsPath: string, id: string, res: Response) {
  const info = await getFileInfo(id, { wsPath });
  if (!info) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  const filePath = join(wsPath, "files", info.file_path);
  const { createReadStream, statSync } = await import("node:fs");

  try {
    const stats = statSync(filePath);
    res.set("Content-Type", info.content_type);
    res.set("Content-Length", String(stats.size));
    createReadStream(filePath).pipe(res);
  } catch {
    res.status(404).json({ error: "File not on disk" });
  }
}

export function createFileRoutes(wsPath: string, embedder: EmbeddingProvider): Router {
  const router = Router();

  // POST /api/files/store — Upload and store a file
  router.post("/store", upload.single("file"), async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      const tags = parseTags(req.body.tags);
      const description = req.body.description || undefined;

      const result = await store(
        {
          sourcePath: req.file.path,
          tags,
          description,
        },
        { wsPath, embedder },
      );

      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/files — List files with pagination
  router.get("/", async (req, res, next) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const cursor = (req.query.cursor as string) || undefined;

      const result = await listFiles({ limit, cursor }, { wsPath });

      res.json({ items: result.items, nextCursor: result.nextCursor, total: result.total });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/files/:id/content — Download file content (must be before /:id)
  router.get("/:id/content", async (req, res, next) => {
    try {
      await streamFileById(wsPath, req.params.id, res);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/files/:id/preview — Alias used by map preview sprites
  router.get("/:id/preview", async (req, res, next) => {
    try {
      await streamFileById(wsPath, req.params.id, res);
    } catch (err) {
      next(err);
    }
  });

  // GET /api/files/:id — Get file metadata
  router.get("/:id", async (req, res, next) => {
    try {
      const info = await getFileInfo(req.params.id, { wsPath });
      if (!info) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      res.json(info);
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/files/:id — Update metadata
  router.patch("/:id", async (req, res, next) => {
    try {
      const changes: { tags?: string[]; description?: string } = {};
      if (req.body.tags !== undefined) {
        changes.tags = req.body.tags;
      }
      if (req.body.description !== undefined) {
        changes.description = req.body.description;
      }

      await update(req.params.id, changes, { wsPath });

      // Return the updated record
      const updated = await getFileInfo(req.params.id, { wsPath });
      if (!updated) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      res.json(updated);
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/files/:id — Soft-delete
  router.delete("/:id", async (req, res, next) => {
    try {
      await remove(req.params.id, { wsPath });
      res.json({ deleted: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
