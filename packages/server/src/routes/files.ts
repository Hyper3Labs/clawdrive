import { Router } from "express";
import type { Response } from "express";
import multer from "multer";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { EmbeddingProvider } from "@clawdrive/core";
import { streamFilePath } from "../lib/file-stream.js";
import { toFileMetadataRecord, toFileTagRecord } from "../lib/file-metadata.js";
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

function parseOptionalText(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw === "string") return raw;
  return String(raw);
}

function parseTaxonomyPath(raw: unknown): string[] | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }

  const segments = raw
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  return segments.length > 0 ? segments : undefined;
}

function matchesTaxonomyPath(taxonomyPath: string[], fileTaxonomyPath: string[]): boolean {
  return taxonomyPath.every((segment) => fileTaxonomyPath.includes(segment));
}

async function listFilesForRoute(
  wsPath: string,
  limit: number,
  cursor: string | undefined,
  taxonomyPath: string[] | undefined,
) {
  if (!taxonomyPath) {
    return listFiles({ limit, cursor }, { wsPath });
  }

  const matchingItems = [] as Awaited<ReturnType<typeof listFiles>>["items"];
  let pageCursor: string | undefined;

  for (let page = 0; page < 200; page += 1) {
    const result = await listFiles({ limit: 500, cursor: pageCursor }, { wsPath });
    matchingItems.push(
      ...result.items.filter((item) => matchesTaxonomyPath(taxonomyPath, item.taxonomy_path)),
    );

    if (!result.nextCursor) {
      break;
    }

    pageCursor = result.nextCursor;
  }

  let items = matchingItems;
  if (cursor) {
    const cursorIndex = items.findIndex((item) => item.id === cursor);
    if (cursorIndex >= 0) {
      items = items.slice(cursorIndex + 1);
    }
  }

  const hasMore = items.length > limit;
  const pageItems = items.slice(0, limit);
  const nextCursor = hasMore ? pageItems[pageItems.length - 1]?.id : undefined;

  return {
    items: pageItems,
    nextCursor,
    total: matchingItems.length,
  };
}

async function streamFileById(wsPath: string, id: string, res: Response) {
  const info = await getFileInfo(id, { wsPath });
  if (!info) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  const filePath = join(wsPath, "files", info.file_path);
  streamFilePath(filePath, info.content_type, res);
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
      const tldr = parseOptionalText(req.body.tldr);
      const digest = parseOptionalText(req.body.digest);
      const abstract = parseOptionalText(req.body.abstract);
      const description = parseOptionalText(req.body.description);

      const result = await store(
        {
          sourcePath: req.file.path,
          originalName: req.file.originalname,
          tags,
          tldr: typeof tldr === "string" ? tldr : undefined,
          digest: typeof digest === "string" ? digest : undefined,
          abstract: typeof abstract === "string" ? abstract : undefined,
          description: typeof description === "string" ? description : undefined,
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
      const taxonomyPath = parseTaxonomyPath(req.query.taxonomyPath);

      const result = await listFilesForRoute(wsPath, limit, cursor, taxonomyPath);

      res.json({
        items: result.items.map((item) => toFileMetadataRecord(item)),
        nextCursor: result.nextCursor,
        total: result.total,
      });
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

  router.get("/:id/tags", async (req, res, next) => {
    try {
      const info = await getFileInfo(req.params.id, { wsPath });
      if (!info) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      res.json(toFileTagRecord(info));
    } catch (err) {
      next(err);
    }
  });

  // GET /api/files/:id — Get file metadata
  router.get("/:id", async (req, res, next) => {
    try {
      const info = await getFileInfo(req.params.id, { wsPath, includeDigest: true });
      if (!info) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      res.json(toFileMetadataRecord(info, { includeDigest: true }));
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/files/:id — Update metadata
  router.patch("/:id", async (req, res, next) => {
    try {
      const changes: { tags?: string[]; description?: string | null; tldr?: string | null; digest?: string | null; abstract?: string | null } = {};
      if (req.body.tags !== undefined) {
        changes.tags = req.body.tags;
      }
      if (req.body.description !== undefined) {
        changes.description = parseOptionalText(req.body.description);
      }
      if (req.body.tldr !== undefined) {
        changes.tldr = parseOptionalText(req.body.tldr);
      }
      if (req.body.digest !== undefined) {
        changes.digest = parseOptionalText(req.body.digest);
      }
      if (req.body.abstract !== undefined) {
        changes.abstract = parseOptionalText(req.body.abstract);
      }

      await update(req.params.id, changes, { wsPath });

      // Return the updated record
      const updated = await getFileInfo(req.params.id, { wsPath, includeDigest: true });
      if (!updated) {
        res.status(404).json({ error: "File not found" });
        return;
      }
      res.json(toFileMetadataRecord(updated, { includeDigest: true }));
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
