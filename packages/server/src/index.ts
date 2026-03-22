import express from "express";
import cors from "cors";
import { join } from "node:path";
import type { EmbeddingProvider } from "@clawdrive/core";
import { errorHandler } from "./middleware/error.js";
import { createFileRoutes } from "./routes/files.js";
import { createSearchRoutes } from "./routes/search.js";

export interface ServerOptions {
  wsPath: string;
  embedder: EmbeddingProvider;
  port: number;
  host: string;
  staticDir?: string;
}

export function createServer(opts: ServerOptions) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // API routes
  app.use("/api/files", createFileRoutes(opts.wsPath, opts.embedder));
  app.use("/api/search", createSearchRoutes(opts.wsPath, opts.embedder));

  // Serve static web UI if provided
  if (opts.staticDir) {
    app.use(express.static(opts.staticDir));
    // SPA fallback: serve index.html for non-API routes
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) return next();
      res.sendFile(join(opts.staticDir!, "index.html"));
    });
  }

  app.use(errorHandler);
  return app;
}
