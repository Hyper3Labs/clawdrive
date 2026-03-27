import { Router } from "express";
import { getTaxonomyTree, rebuildTaxonomy } from "@clawdrive/core";

export function createTaxonomyRoutes(wsPath: string): Router {
  const router = Router();

  // GET /api/taxonomy — Get the taxonomy tree
  router.get("/", async (_req, res, next) => {
    try {
      const tree = await getTaxonomyTree({ wsPath });
      res.json(tree);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/taxonomy/rebuild — Rebuild taxonomy from scratch
  router.post("/rebuild", async (_req, res, next) => {
    try {
      await rebuildTaxonomy({ wsPath });
      const tree = await getTaxonomyTree({ wsPath });
      res.json(tree);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
