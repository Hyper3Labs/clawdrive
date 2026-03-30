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
  const baseDir = await mkdtemp(join(tmpdir(), "clawdrive-read-only-routes-"));
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

describe("read-only mode", () => {
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

  it("allows GET routes while blocking mutating API routes", async () => {
    const srcPath = join(ctx.baseDir, "existing.txt");
    await writeFile(srcPath, "existing content");
    const stored = await store({ sourcePath: srcPath }, { wsPath: ctx.wsPath, embedder });

    const listener = await listen(
      createServer({
        wsPath: ctx.wsPath,
        embedder,
        host: "127.0.0.1",
        port: 0,
        readOnly: true,
      }),
    );
    servers.push(listener.server);

    const listRes = await fetch(`${listener.baseUrl}/api/files`);
    expect(listRes.status).toBe(200);

    const form = new FormData();
    form.append("file", new File(["blocked"], "blocked.txt", { type: "text/plain" }));

    const uploadRes = await fetch(`${listener.baseUrl}/api/files/store`, {
      method: "POST",
      body: form,
    });
    expect(uploadRes.status).toBe(403);
    await expect(uploadRes.json()).resolves.toEqual({
      error: "read_only_demo",
      message: "This demo is read-only",
    });

    const createPotRes = await fetch(`${listener.baseUrl}/api/pots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Blocked Pot" }),
    });
    expect(createPotRes.status).toBe(403);

    const patchRes = await fetch(`${listener.baseUrl}/api/files/${stored.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tldr: "Should not apply" }),
    });
    expect(patchRes.status).toBe(403);

    const deleteRes = await fetch(`${listener.baseUrl}/api/files/${stored.id}`, {
      method: "DELETE",
    });
    expect(deleteRes.status).toBe(403);

    const getRes = await fetch(`${listener.baseUrl}/api/files/${stored.id}`);
    expect(getRes.status).toBe(200);
    const payload = await getRes.json() as { id: string; tldr?: string | null };
    expect(payload.id).toBe(stored.id);
    expect(payload.tldr).toBeUndefined();
  });
});