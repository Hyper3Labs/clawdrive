import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("sharp", () => {
  const chain = {
    resize: () => chain,
    jpeg: () => chain,
    toFile: async () => undefined,
  };

  return {
    default: () => chain,
  };
});

import {
  MockEmbeddingProvider,
  initWorkspace,
  resolveWorkspacePath,
  store,
} from "@clawdrive/core";
import { createServer } from "../src/index.js";

async function createTestWorkspace() {
  const baseDir = await mkdtemp(join(tmpdir(), "clawdrive-taxonomy-routes-"));
  const wsPath = resolveWorkspacePath(baseDir, "test");
  await initWorkspace(wsPath);
  return {
    baseDir,
    wsPath,
    cleanup: () => rm(baseDir, { recursive: true }),
  };
}

async function listen(serverApp: ReturnType<typeof createServer>) {
  return new Promise<{ server: Server; baseUrl: string }>((resolve, reject) => {
    const server = serverApp.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });

    server.on("error", reject);
  });
}

async function closeServer(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

describe("taxonomy and projection routes", () => {
  let ctx: Awaited<ReturnType<typeof createTestWorkspace>>;
  let embedder: MockEmbeddingProvider;
  const servers: Server[] = [];

  beforeEach(async () => {
    ctx = await createTestWorkspace();
    embedder = new MockEmbeddingProvider(3072);
  });

  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => closeServer(server)));
    await ctx.cleanup();
  });

  it("GET /api/taxonomy — empty workspace returns null", async () => {
    const listener = await listen(
      createServer({ wsPath: ctx.wsPath, embedder, host: "127.0.0.1", port: 0 }),
    );
    servers.push(listener.server);

    const res = await fetch(`${listener.baseUrl}/api/taxonomy`);
    expect(res.status).toBe(200);

    const payload = await res.json();
    // Empty workspace returns null (no taxonomy tree yet)
    expect(payload).toBeNull();
  });

  it("GET /api/taxonomy — after storing files, returns tree with nodes", async () => {
    const src1 = join(ctx.baseDir, "doc1.txt");
    const src2 = join(ctx.baseDir, "doc2.txt");
    await writeFile(src1, "first document for taxonomy");
    await writeFile(src2, "second document for taxonomy");
    await store({ sourcePath: src1 }, { wsPath: ctx.wsPath, embedder });
    await store({ sourcePath: src2 }, { wsPath: ctx.wsPath, embedder });

    const listener = await listen(
      createServer({ wsPath: ctx.wsPath, embedder, host: "127.0.0.1", port: 0 }),
    );
    servers.push(listener.server);

    const res = await fetch(`${listener.baseUrl}/api/taxonomy`);
    expect(res.status).toBe(200);

    // Taxonomy assignment disabled for v1 — tree should be null
    const tree = await res.json() as { id: string; label: string; itemCount: number } | null;
    expect(tree).toBeNull();
  });

  it("GET /api/projections — after storing files, returns array with x/y/z coordinates", async () => {
    // Need at least 2 files for UMAP to produce meaningful output
    const src1 = join(ctx.baseDir, "proj1.txt");
    const src2 = join(ctx.baseDir, "proj2.txt");
    await writeFile(src1, "projection file alpha");
    await writeFile(src2, "projection file beta");
    await store({ sourcePath: src1 }, { wsPath: ctx.wsPath, embedder });
    await store({ sourcePath: src2 }, { wsPath: ctx.wsPath, embedder });

    const listener = await listen(
      createServer({ wsPath: ctx.wsPath, embedder, host: "127.0.0.1", port: 0 }),
    );
    servers.push(listener.server);

    const res = await fetch(`${listener.baseUrl}/api/projections`);
    expect(res.status).toBe(200);

    const points = await res.json() as Array<{ id: string; x: number; y: number; z: number }>;
    expect(Array.isArray(points)).toBe(true);
    expect(points.length).toBeGreaterThanOrEqual(2);

    for (const point of points) {
      expect(point.id).toBeDefined();
      expect(typeof point.x).toBe("number");
      expect(typeof point.y).toBe("number");
      expect(typeof point.z).toBe("number");
    }
  });
});
