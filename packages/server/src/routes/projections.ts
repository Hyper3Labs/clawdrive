import { Router } from "express";
import { getProjections, recomputeProjections } from "../umap.js";

export function createProjectionRoutes(wsPath: string): Router {
  const router = Router();

  // GET /api/projections — Get UMAP projections (cached)
  router.get("/", async (_req, res, next) => {
    try {
      const points = await getProjections(wsPath);
      res.json(points);
    } catch (err) {
      next(err);
    }
  });

  // POST /api/projections/recompute — Force recompute projections
  router.post("/recompute", async (_req, res, next) => {
    try {
      const points = await recomputeProjections(wsPath);
      res.json(points);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
