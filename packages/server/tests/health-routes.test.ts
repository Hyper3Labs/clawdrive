import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initWorkspace, resolveWorkspacePath, MockEmbeddingProvider } from "@clawdrive/core";
import { createServer } from "../src/index.js";

let server: Server;
let baseUrl: string;
let cleanupDir: () => Promise<void>;

beforeAll(async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "clawdrive-health-test-"));
  const wsPath = resolveWorkspacePath(baseDir, "test");
  await initWorkspace(wsPath);
  const embedder = new MockEmbeddingProvider(3072);

  const app = createServer({ wsPath, embedder, port: 0, host: "127.0.0.1" });

  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
    server.on("error", reject);
  });

  cleanupDir = () => rm(baseDir, { recursive: true, force: true });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await cleanupDir();
});

describe("/api/health", () => {
  it("returns ok status", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });
});
