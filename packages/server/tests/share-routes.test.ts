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
  approveShare,
  buildPotTag,
  createPot,
  createPotShare,
  initWorkspace,
  resolveWorkspacePath,
  store,
} from "@clawdrive/core";
import { createServer } from "../src/index.js";

async function createTestWorkspace() {
  const baseDir = await mkdtemp(join(tmpdir(), "clawdrive-share-routes-"));
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

describe("share routes", () => {
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

  it("POST /api/shares/pot/:slug — creates a link share and returns token", async () => {
    const pot = await createPot({ name: "Share Pot" }, { wsPath: ctx.wsPath });
    const srcPath = join(ctx.baseDir, "shared.txt");
    await writeFile(srcPath, "shared content");
    await store(
      { sourcePath: srcPath, tags: [buildPotTag(pot.slug)] },
      { wsPath: ctx.wsPath, embedder },
    );

    const listener = await listen(
      createServer({ wsPath: ctx.wsPath, embedder, host: "127.0.0.1", port: 0 }),
    );
    servers.push(listener.server);

    const res = await fetch(`${listener.baseUrl}/api/shares/pot/${pot.slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "link", role: "read" }),
    });

    expect(res.status).toBe(201);
    const payload = await res.json() as { id: string; token: string; status: string };
    expect(payload.id).toBeDefined();
    expect(payload.token).toBeDefined();
    expect(typeof payload.token).toBe("string");
    expect(payload.status).toBe("pending");
  });

  it("POST /api/shares/:id/approve — approves a share", async () => {
    const pot = await createPot({ name: "Approve Pot" }, { wsPath: ctx.wsPath });
    const srcPath = join(ctx.baseDir, "approve-file.txt");
    await writeFile(srcPath, "file to approve sharing");
    await store(
      { sourcePath: srcPath, tags: [buildPotTag(pot.slug)] },
      { wsPath: ctx.wsPath, embedder },
    );

    const share = await createPotShare(
      { pot: pot.slug, kind: "link", role: "read" },
      { wsPath: ctx.wsPath },
    );

    const listener = await listen(
      createServer({ wsPath: ctx.wsPath, embedder, host: "127.0.0.1", port: 0 }),
    );
    servers.push(listener.server);

    const res = await fetch(`${listener.baseUrl}/api/shares/${share.id}/approve`, {
      method: "POST",
    });

    expect(res.status).toBe(200);
    const payload = await res.json() as { status: string };
    expect(payload.status).toBe("active");
  });

  it("POST /api/shares/:id/revoke — revokes a share", async () => {
    const pot = await createPot({ name: "Revoke Pot" }, { wsPath: ctx.wsPath });
    const srcPath = join(ctx.baseDir, "revoke-file.txt");
    await writeFile(srcPath, "file to revoke sharing");
    await store(
      { sourcePath: srcPath, tags: [buildPotTag(pot.slug)] },
      { wsPath: ctx.wsPath, embedder },
    );

    const share = await createPotShare(
      { pot: pot.slug, kind: "link", role: "read" },
      { wsPath: ctx.wsPath },
    );
    await approveShare(share.id, { wsPath: ctx.wsPath });

    const listener = await listen(
      createServer({ wsPath: ctx.wsPath, embedder, host: "127.0.0.1", port: 0 }),
    );
    servers.push(listener.server);

    const res = await fetch(`${listener.baseUrl}/api/shares/${share.id}/revoke`, {
      method: "POST",
    });

    expect(res.status).toBe(200);
    const payload = await res.json() as { status: string };
    expect(payload.status).toBe("revoked");
  });

  it("GET /api/shares/inbox — lists pending shares", async () => {
    const pot = await createPot({ name: "Inbox Pot" }, { wsPath: ctx.wsPath });
    const srcPath = join(ctx.baseDir, "inbox-file.txt");
    await writeFile(srcPath, "inbox test content");
    await store(
      { sourcePath: srcPath, tags: [buildPotTag(pot.slug)] },
      { wsPath: ctx.wsPath, embedder },
    );

    await createPotShare(
      { pot: pot.slug, kind: "link", role: "read" },
      { wsPath: ctx.wsPath },
    );

    const listener = await listen(
      createServer({ wsPath: ctx.wsPath, embedder, host: "127.0.0.1", port: 0 }),
    );
    servers.push(listener.server);

    const res = await fetch(`${listener.baseUrl}/api/shares/inbox`);
    expect(res.status).toBe(200);

    const payload = await res.json() as { items: Array<{ status: string }>; total: number };
    expect(payload.total).toBeGreaterThanOrEqual(1);
    for (const item of payload.items) {
      expect(item.status).toBe("pending");
    }
  });

  it("GET /s/:token — approved share returns HTML page", async () => {
    const pot = await createPot({ name: "HTML Pot" }, { wsPath: ctx.wsPath });
    const srcPath = join(ctx.baseDir, "html-file.txt");
    await writeFile(srcPath, "html page content");
    await store(
      { sourcePath: srcPath, tags: [buildPotTag(pot.slug)], description: "Shared desc" },
      { wsPath: ctx.wsPath, embedder },
    );

    const pending = await createPotShare(
      { pot: pot.slug, kind: "link", role: "read" },
      { wsPath: ctx.wsPath },
    );
    const approved = await approveShare(pending.id, { wsPath: ctx.wsPath });

    const listener = await listen(
      createServer({ wsPath: ctx.wsPath, embedder, host: "127.0.0.1", port: 0 }),
    );
    servers.push(listener.server);

    const res = await fetch(`${listener.baseUrl}/s/${approved.token}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("HTML Pot");
    expect(html).toContain("window.location.pathname");
  });

  it("GET /s/:token/manifest.json — approved share returns manifest with items", async () => {
    const pot = await createPot({ name: "Manifest Pot" }, { wsPath: ctx.wsPath });
    const srcPath = join(ctx.baseDir, "manifest-file.txt");
    await writeFile(srcPath, "manifest item content");
    await store(
      { sourcePath: srcPath, tags: [buildPotTag(pot.slug)], description: "A shared item" },
      { wsPath: ctx.wsPath, embedder },
    );

    const pending = await createPotShare(
      { pot: pot.slug, kind: "link", role: "read" },
      { wsPath: ctx.wsPath },
    );
    const approved = await approveShare(pending.id, { wsPath: ctx.wsPath });

    const listener = await listen(
      createServer({ wsPath: ctx.wsPath, embedder, host: "127.0.0.1", port: 0 }),
    );
    servers.push(listener.server);

    const res = await fetch(`${listener.baseUrl}/s/${approved.token}/manifest.json`);
    expect(res.status).toBe(200);

    const manifest = await res.json() as {
      total: number;
      items: Array<{ original_name: string; content_url: string }>;
    };
    expect(manifest.total).toBe(1);
    expect(manifest.items[0]?.original_name).toBe("manifest-file.txt");
    expect(manifest.items[0]?.content_url).toMatch(/^items\/[^/]+\/content$/);
  });
});
