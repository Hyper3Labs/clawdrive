import { Router } from "express";
import { getUsage } from "@clawdrive/core";

export function createUsageRoutes(wsPath: string): Router {
  const router = Router();

  // GET /api/usage — Get usage statistics
  router.get("/", async (req, res, next) => {
    try {
      const usage = await getUsage(wsPath);
      res.json(usage);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
