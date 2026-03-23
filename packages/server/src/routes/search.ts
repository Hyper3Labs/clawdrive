import { Router } from "express";
import type { EmbeddingProvider, SearchInput } from "@clawdrive/core";
import { search } from "@clawdrive/core";

export function createSearchRoutes(wsPath: string, embedder: EmbeddingProvider): Router {
  const router = Router();

  // GET /api/search — Search files
  router.get("/", async (req, res, next) => {
    try {
      const q = req.query.q as string | undefined;
      if (!q) {
        res.status(400).json({ error: "Query parameter 'q' is required" });
        return;
      }

      const mode = (req.query.mode as SearchInput["mode"]) || undefined;
      const contentType = (req.query.type as string) || undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const minScore = req.query.minScore
        ? parseFloat(req.query.minScore as string)
        : undefined;
      const pot = (req.query.pot as string) || undefined;

      const tags = req.query.tags
        ? (req.query.tags as string)
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined;

      const results = await search(
        { query: q, mode, contentType, tags, pot, limit, minScore },
        { wsPath, embedder },
      );

      res.json({ results, total: results.length });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
