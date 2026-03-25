import { Router } from "express";
import { toFileMetadataRecord } from "../lib/file-metadata.js";
import {
  createPot,
  listPotFiles,
  listPotShares,
  listPots,
  renamePot,
  deletePot,
} from "@clawdrive/core";

export function createPotRoutes(wsPath: string): Router {
  const router = Router();

  router.get("/", async (_req, res, next) => {
    try {
      const pots = await listPots({ wsPath });
      res.json({ pots, total: pots.length });
    } catch (err) {
      next(err);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      if (!req.body?.name || typeof req.body.name !== "string") {
        res.status(400).json({ error: "Field 'name' is required" });
        return;
      }

      const pot = await createPot(
        {
          name: req.body.name,
          description: typeof req.body.description === "string" ? req.body.description : undefined,
        },
        { wsPath },
      );

      res.status(201).json(pot);
    } catch (err) {
      next(err);
    }
  });

  router.patch("/:id", async (req, res, next) => {
    try {
      if (!req.body?.name || typeof req.body.name !== "string") {
        res.status(400).json({ error: "Field 'name' is required" });
        return;
      }
      const pot = await renamePot(req.params.id, req.body.name, { wsPath });
      res.json(pot);
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id", async (req, res, next) => {
    try {
      await deletePot(req.params.id, { wsPath });
      res.json({ deleted: true });
    } catch (err) {
      next(err);
    }
  });

  router.get("/:pot/files", async (req, res, next) => {
    try {
      const items = await listPotFiles(req.params.pot, { wsPath });
      res.json({ items: items.map((item) => toFileMetadataRecord(item)), total: items.length });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/pots/:pot/shares — list shares for a specific pot
  router.get("/:pot/shares", async (req, res, next) => {
    try {
      const items = await listPotShares(req.params.pot, { wsPath });
      res.json({ items, total: items.length });
    } catch (err) {
      next(err);
    }
  });

  return router;
}