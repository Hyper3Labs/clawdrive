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
  const baseDir = await mkdtemp(join(tmpdir(), "clawdrive-files-routes-"));
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

describe("file routes", () => {
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

  it("POST /api/files/store — uploads a text file and returns id", async () => {
    const listener = await listen(
      createServer({ wsPath: ctx.wsPath, embedder, host: "127.0.0.1", port: 0 }),
    );
    servers.push(listener.server);

    const form = new FormData();
    form.append(
      "file",
      new File(["Hello, ClawDrive!"], "hello.txt", { type: "text/plain" }),
    );

    const res = await fetch(`${listener.baseUrl}/api/files/store`, {
      method: "POST",
      body: form,
    });

    expect(res.status).toBe(200);
    const payload = await res.json() as { id: string; status: string };
    expect(payload.id).toBeDefined();
    expect(typeof payload.id).toBe("string");
    expect(payload.status).toBe("stored");
  });

  it("GET /api/files — lists files with items array and total", async () => {
    const srcPath = join(ctx.baseDir, "list-test.txt");
    await writeFile(srcPath, "file for listing");
    await store({ sourcePath: srcPath }, { wsPath: ctx.wsPath, embedder });

    const listener = await listen(
      createServer({ wsPath: ctx.wsPath, embedder, host: "127.0.0.1", port: 0 }),
    );
    servers.push(listener.server);

    const res = await fetch(`${listener.baseUrl}/api/files`);
    expect(res.status).toBe(200);

    const payload = await res.json() as { items: unknown[]; total: number };
    expect(Array.isArray(payload.items)).toBe(true);
    expect(payload.total).toBeGreaterThanOrEqual(1);
    expect(payload.items.length).toBeGreaterThanOrEqual(1);
  });

  it("GET /api/files/:id — returns file metadata", async () => {
    const srcPath = join(ctx.baseDir, "detail.txt");
    await writeFile(srcPath, "detail content");
    const stored = await store(
      { sourcePath: srcPath, description: "A detail file" },
      { wsPath: ctx.wsPath, embedder },
    );

    const listener = await listen(
      createServer({ wsPath: ctx.wsPath, embedder, host: "127.0.0.1", port: 0 }),
    );
    servers.push(listener.server);

    const res = await fetch(`${listener.baseUrl}/api/files/${stored.id}`);
    expect(res.status).toBe(200);

    const payload = await res.json() as Record<string, unknown>;
    expect(payload.id).toBe(stored.id);
    expect(payload.original_name).toBe("detail.txt");
    expect(payload.content_type).toBeDefined();
    expect(payload.file_size).toBeDefined();
    expect(payload.tldr).toBe("A detail file");
  });

  it("PATCH /api/files/:id — updates tldr and tags", async () => {
    const srcPath = join(ctx.baseDir, "patch-me.txt");
    await writeFile(srcPath, "patch content");
    const stored = await store(
      { sourcePath: srcPath },
      { wsPath: ctx.wsPath, embedder },
    );

    const listener = await listen(
      createServer({ wsPath: ctx.wsPath, embedder, host: "127.0.0.1", port: 0 }),
    );
    servers.push(listener.server);

    const patchRes = await fetch(`${listener.baseUrl}/api/files/${stored.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tldr: "Updated summary", tags: ["alpha", "beta"] }),
    });

    expect(patchRes.status).toBe(200);

    // Verify changes persisted
    const getRes = await fetch(`${listener.baseUrl}/api/files/${stored.id}`);
    const payload = await getRes.json() as Record<string, unknown>;
    expect(payload.tldr).toBe("Updated summary");

    // Verify tags via dedicated endpoint
    const tagsRes = await fetch(`${listener.baseUrl}/api/files/${stored.id}/tags`);
    const tagsPayload = await tagsRes.json() as { tags: string[] };
    expect(tagsPayload.tags).toContain("alpha");
    expect(tagsPayload.tags).toContain("beta");
  });

  it("DELETE /api/files/:id — soft deletes and file is gone from list", async () => {
    const srcPath = join(ctx.baseDir, "delete-me.txt");
    await writeFile(srcPath, "to be deleted");
    const stored = await store(
      { sourcePath: srcPath },
      { wsPath: ctx.wsPath, embedder },
    );

    const listener = await listen(
      createServer({ wsPath: ctx.wsPath, embedder, host: "127.0.0.1", port: 0 }),
    );
    servers.push(listener.server);

    const delRes = await fetch(`${listener.baseUrl}/api/files/${stored.id}`, {
      method: "DELETE",
    });
    expect(delRes.status).toBe(200);
    const delPayload = await delRes.json() as { deleted: boolean };
    expect(delPayload.deleted).toBe(true);

    // Verify file is gone from list
    const listRes = await fetch(`${listener.baseUrl}/api/files`);
    const listPayload = await listRes.json() as { items: Array<{ id: string }> };
    const found = listPayload.items.find((item) => item.id === stored.id);
    expect(found).toBeUndefined();
  });

  it("GET /api/files/:id/content — streams content matching original text", async () => {
    const originalText = "Stream this content back to me!";
    const srcPath = join(ctx.baseDir, "stream.txt");
    await writeFile(srcPath, originalText);
    const stored = await store(
      { sourcePath: srcPath },
      { wsPath: ctx.wsPath, embedder },
    );

    const listener = await listen(
      createServer({ wsPath: ctx.wsPath, embedder, host: "127.0.0.1", port: 0 }),
    );
    servers.push(listener.server);

    const res = await fetch(`${listener.baseUrl}/api/files/${stored.id}/content`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toBe(originalText);
  });
});
