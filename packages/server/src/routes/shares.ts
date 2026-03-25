import { Router } from "express";
import { toFileMetadataRecord } from "../lib/file-metadata.js";
import {
  approveShare,
  createPotShare,
  getShare,
  listShareInbox,
  resolveShare,
  revokeShare,
} from "@clawdrive/core";

export function createShareRoutes(wsPath: string): Router {
  const router = Router();

  router.get("/inbox", async (_req, res, next) => {
    try {
      const items = await listShareInbox({ wsPath });
      res.json({ items, total: items.length });
    } catch (err) {
      next(err);
    }
  });

  router.post("/pot/:pot", async (req, res, next) => {
    try {
      const kind = req.body?.kind === "principal" ? "principal" : "link";
      const share = await createPotShare(
        {
          pot: req.params.pot,
          kind,
          principal: typeof req.body?.principal === "string" ? req.body.principal : undefined,
          role: req.body?.role === "write" ? "write" : "read",
          expiresAt: typeof req.body?.expiresAt === "number" ? req.body.expiresAt : undefined,
        },
        { wsPath },
      );

      res.status(201).json(share);
    } catch (err) {
      next(err);
    }
  });

  router.post("/:ref/approve", async (req, res, next) => {
    try {
      const share = await approveShare(req.params.ref, { wsPath });
      res.json(share);
    } catch (err) {
      next(err);
    }
  });

  router.post("/:ref/revoke", async (req, res, next) => {
    try {
      const share = await revokeShare(req.params.ref, { wsPath });
      res.json(share);
    } catch (err) {
      next(err);
    }
  });

  router.get("/:ref", async (req, res, next) => {
    try {
      const share = await getShare(req.params.ref, { wsPath });
      if (!share) {
        res.status(404).json({ error: "Share not found" });
        return;
      }

      if (share.status !== "active") {
        res.status(409).json({ error: `Share is ${share.status}`, share });
        return;
      }

      const resolved = await resolveShare(req.params.ref, { wsPath });
      res.json({
        ...resolved,
        files: resolved?.files.map((file) => toFileMetadataRecord(file)) ?? [],
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}