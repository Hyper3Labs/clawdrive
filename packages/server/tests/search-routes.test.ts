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
  buildPotTag,
  createPot,
  initWorkspace,
  resolveWorkspacePath,
  store,
} from "@clawdrive/core";
import { createServer } from "../src/index.js";

async function createTestWorkspace() {
  const baseDir = await mkdtemp(join(tmpdir(), "clawdrive-search-routes-"));
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

describe("search routes", () => {
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

  it("GET /api/search?q=hello — returns results with scores", async () => {
    const srcPath = join(ctx.baseDir, "hello.txt");
    await writeFile(srcPath, "hello world content");
    await store({ sourcePath: srcPath }, { wsPath: ctx.wsPath, embedder });

    const listener = await listen(
      createServer({ wsPath: ctx.wsPath, embedder, host: "127.0.0.1", port: 0 }),
    );
    servers.push(listener.server);

    const res = await fetch(`${listener.baseUrl}/api/search?q=hello`);
    expect(res.status).toBe(200);

    const payload = await res.json() as { results: Array<{ id: string; score: number }>; total: number };
    expect(Array.isArray(payload.results)).toBe(true);
    expect(payload.total).toBeGreaterThanOrEqual(1);
    expect(payload.results[0]?.score).toBeDefined();
    expect(typeof payload.results[0]?.score).toBe("number");
  });

  it("GET /api/search?q=test&type=text/plain — filters by content type", async () => {
    const srcPath = join(ctx.baseDir, "typed.txt");
    await writeFile(srcPath, "typed file content for search");
    await store({ sourcePath: srcPath }, { wsPath: ctx.wsPath, embedder });

    const listener = await listen(
      createServer({ wsPath: ctx.wsPath, embedder, host: "127.0.0.1", port: 0 }),
    );
    servers.push(listener.server);

    const res = await fetch(`${listener.baseUrl}/api/search?q=test&type=text/plain`);
    expect(res.status).toBe(200);

    const payload = await res.json() as { results: Array<{ contentType: string }> };
    for (const result of payload.results) {
      expect(result.contentType).toBe("text/plain");
    }
  });

  it("GET /api/search?q=query&pot=my-pot — filters by pot", async () => {
    const pot = await createPot({ name: "My Pot" }, { wsPath: ctx.wsPath });

    const srcPath = join(ctx.baseDir, "potted.txt");
    await writeFile(srcPath, "potted file for search");
    await store(
      { sourcePath: srcPath, tags: [buildPotTag(pot.slug)] },
      { wsPath: ctx.wsPath, embedder },
    );

    const otherPath = join(ctx.baseDir, "other.txt");
    await writeFile(otherPath, "other file not in pot");
    await store({ sourcePath: otherPath }, { wsPath: ctx.wsPath, embedder });

    const listener = await listen(
      createServer({ wsPath: ctx.wsPath, embedder, host: "127.0.0.1", port: 0 }),
    );
    servers.push(listener.server);

    const res = await fetch(`${listener.baseUrl}/api/search?q=file&pot=${pot.slug}`);
    expect(res.status).toBe(200);

    const payload = await res.json() as { results: Array<{ id: string; tags: string[] }> };
    expect(payload.results.length).toBeGreaterThanOrEqual(1);
    for (const result of payload.results) {
      expect(result.tags).toContain(buildPotTag(pot.slug));
    }
  });

  it("GET /api/search?q=query&limit=1 — limits results", async () => {
    const src1 = join(ctx.baseDir, "a.txt");
    const src2 = join(ctx.baseDir, "b.txt");
    await writeFile(src1, "first searchable file");
    await writeFile(src2, "second searchable file");
    await store({ sourcePath: src1 }, { wsPath: ctx.wsPath, embedder });
    await store({ sourcePath: src2 }, { wsPath: ctx.wsPath, embedder });

    const listener = await listen(
      createServer({ wsPath: ctx.wsPath, embedder, host: "127.0.0.1", port: 0 }),
    );
    servers.push(listener.server);

    const res = await fetch(`${listener.baseUrl}/api/search?q=searchable&limit=1`);
    expect(res.status).toBe(200);

    const payload = await res.json() as { results: unknown[]; total: number };
    expect(payload.results.length).toBe(1);
  });

  it("GET /api/search without q — returns 400", async () => {
    const listener = await listen(
      createServer({ wsPath: ctx.wsPath, embedder, host: "127.0.0.1", port: 0 }),
    );
    servers.push(listener.server);

    const res = await fetch(`${listener.baseUrl}/api/search`);
    expect(res.status).toBe(400);

    const payload = await res.json() as { error: string };
    expect(payload.error).toBeDefined();
  });

  it("GET /api/search?q=xyzzy_nonsense — returns empty results", async () => {
    const listener = await listen(
      createServer({ wsPath: ctx.wsPath, embedder, host: "127.0.0.1", port: 0 }),
    );
    servers.push(listener.server);

    const res = await fetch(`${listener.baseUrl}/api/search?q=xyzzy_nonsense_nothing`);
    expect(res.status).toBe(200);

    const payload = await res.json() as { results: unknown[]; total: number };
    expect(payload.results).toEqual([]);
    expect(payload.total).toBe(0);
  });
});
