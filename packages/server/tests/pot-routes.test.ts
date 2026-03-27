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
  initWorkspace,
  resolveWorkspacePath,
  store,
} from "@clawdrive/core";
import { createServer } from "../src/index.js";

async function createTestWorkspace() {
  const baseDir = await mkdtemp(join(tmpdir(), "clawdrive-pot-routes-"));
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

describe("pot routes", () => {
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

  it("POST /api/pots — creates a pot with name, description, slug, and id", async () => {
    const listener = await listen(
      createServer({ wsPath: ctx.wsPath, embedder, host: "127.0.0.1", port: 0 }),
    );
    servers.push(listener.server);

    const res = await fetch(`${listener.baseUrl}/api/pots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test Pot", description: "A test pot" }),
    });

    expect(res.status).toBe(201);
    const payload = await res.json() as { id: string; name: string; slug: string; description: string | null };
    expect(payload.id).toBeDefined();
    expect(payload.name).toBe("Test Pot");
    expect(payload.slug).toBe("test-pot");
    expect(payload.description).toBe("A test pot");
  });

  it("GET /api/pots — lists all pots including created pot", async () => {
    const listener = await listen(
      createServer({ wsPath: ctx.wsPath, embedder, host: "127.0.0.1", port: 0 }),
    );
    servers.push(listener.server);

    // Create a pot first
    await fetch(`${listener.baseUrl}/api/pots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Listed Pot" }),
    });

    const res = await fetch(`${listener.baseUrl}/api/pots`);
    expect(res.status).toBe(200);

    const payload = await res.json() as { pots: Array<{ name: string; slug: string }>; total: number };
    expect(payload.total).toBeGreaterThanOrEqual(1);
    const found = payload.pots.find((p) => p.slug === "listed-pot");
    expect(found).toBeDefined();
    expect(found!.name).toBe("Listed Pot");
  });

  it("PATCH /api/pots/:id — renames a pot", async () => {
    const listener = await listen(
      createServer({ wsPath: ctx.wsPath, embedder, host: "127.0.0.1", port: 0 }),
    );
    servers.push(listener.server);

    // Create a pot
    const createRes = await fetch(`${listener.baseUrl}/api/pots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Old Name" }),
    });
    const created = await createRes.json() as { id: string };

    // Rename it
    const patchRes = await fetch(`${listener.baseUrl}/api/pots/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Name" }),
    });
    expect(patchRes.status).toBe(200);

    const updated = await patchRes.json() as { name: string; slug: string };
    expect(updated.name).toBe("New Name");
    expect(updated.slug).toBe("new-name");
  });

  it("DELETE /api/pots/:id — deletes a pot and it disappears from list", async () => {
    const listener = await listen(
      createServer({ wsPath: ctx.wsPath, embedder, host: "127.0.0.1", port: 0 }),
    );
    servers.push(listener.server);

    // Create a pot
    const createRes = await fetch(`${listener.baseUrl}/api/pots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "To Delete" }),
    });
    const created = await createRes.json() as { id: string };

    // Delete it
    const delRes = await fetch(`${listener.baseUrl}/api/pots/${created.id}`, {
      method: "DELETE",
    });
    expect(delRes.status).toBe(200);

    const delPayload = await delRes.json() as { deleted: boolean };
    expect(delPayload.deleted).toBe(true);

    // Verify it is gone
    const listRes = await fetch(`${listener.baseUrl}/api/pots`);
    const listPayload = await listRes.json() as { pots: Array<{ id: string }> };
    const found = listPayload.pots.find((p) => p.id === created.id);
    expect(found).toBeUndefined();
  });

  it("GET /api/pots/:slug/files — lists files in a pot", async () => {
    const listener = await listen(
      createServer({ wsPath: ctx.wsPath, embedder, host: "127.0.0.1", port: 0 }),
    );
    servers.push(listener.server);

    // Create a pot via the API
    const createRes = await fetch(`${listener.baseUrl}/api/pots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Files Pot" }),
    });
    const pot = await createRes.json() as { id: string; slug: string };

    // Store a file in the pot using core's buildPotTag
    const srcPath = join(ctx.baseDir, "pot-file.txt");
    await writeFile(srcPath, "file inside pot");
    await store(
      { sourcePath: srcPath, tags: [buildPotTag(pot.slug)] },
      { wsPath: ctx.wsPath, embedder },
    );

    const res = await fetch(`${listener.baseUrl}/api/pots/${pot.slug}/files`);
    expect(res.status).toBe(200);

    const payload = await res.json() as { items: Array<{ original_name: string }>; total: number };
    expect(payload.total).toBe(1);
    expect(payload.items[0]?.original_name).toBe("pot-file.txt");
  });
});
