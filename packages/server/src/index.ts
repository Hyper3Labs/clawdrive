import express from "express";
import { join } from "node:path";
import type { EmbeddingProvider } from "@clawdrive/core";
import { createAppShell } from "./app.js";
import { errorHandler } from "./middleware/error.js";
import { createReadOnlyMiddleware } from "./middleware/read-only.js";
import { createFileRoutes } from "./routes/files.js";
import { createThumbnailRoutes } from "./routes/thumbnails.js";
import { createPotRoutes } from "./routes/pots.js";
import { createSearchRoutes } from "./routes/search.js";
import { createShareRoutes } from "./routes/shares.js";
import { createPublicShareRoutes } from "./routes/public-shares.js";
import { createTaxonomyRoutes } from "./routes/taxonomy.js";
import { createProjectionRoutes } from "./routes/projections.js";
import { createUsageRoutes } from "./routes/usage.js";
import { createPublicShareServer } from "./public.js";

export interface ServerOptions {
  wsPath: string;
  embedder: EmbeddingProvider;
  port: number;
  host: string;
  staticDir?: string;
  readOnly?: boolean;
}

export function createServer(opts: ServerOptions) {
  const app = createAppShell();

  app.use("/s", createPublicShareRoutes(opts.wsPath));

  if (opts.readOnly) {
    app.use("/api", createReadOnlyMiddleware());
  }

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // API routes
  app.use("/api/files", createThumbnailRoutes(opts.wsPath));
  app.use("/api/files", createFileRoutes(opts.wsPath, opts.embedder));
  app.use("/api/pots", createPotRoutes(opts.wsPath));
  app.use("/api/search", createSearchRoutes(opts.wsPath, opts.embedder));
  app.use("/api/shares", createShareRoutes(opts.wsPath));
  app.use("/api/taxonomy", createTaxonomyRoutes(opts.wsPath));
  app.use("/api/projections", createProjectionRoutes(opts.wsPath));
  app.use("/api/usage", createUsageRoutes(opts.wsPath));
  app.get("/api/config", (req, res) => {
    res.json({ readOnly: !!opts.readOnly });
  });

  // Serve static web UI if provided
  if (opts.staticDir) {
    app.use(express.static(opts.staticDir));
    // SPA fallback: serve index.html for non-API routes
    app.get("/{*path}", (req, res, next) => {
      if (req.path.startsWith("/api/")) return next();
      res.sendFile(join(opts.staticDir!, "index.html"));
    });
  }

  app.use(errorHandler);
  return app;
}

export { createPublicShareServer };
export type { PublicShareServerOptions } from "./public.js";
