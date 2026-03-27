import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import {
  MockEmbeddingProvider,
  initWorkspace,
  resolveWorkspacePath,
} from "@clawdrive/core";

vi.mock("sharp", () => {
  const chain = { resize: () => chain, jpeg: () => chain, toFile: async () => undefined };
  return { default: () => chain };
});

import { createServer } from "@clawdrive/server";

async function createTestWorkspace() {
  const baseDir = await mkdtemp(join(tmpdir(), "clawdrive-cli-test-"));
  const wsPath = resolveWorkspacePath(baseDir, "test");
  await initWorkspace(wsPath);
  return {
    baseDir,
    wsPath,
    cleanup: () => rm(baseDir, { recursive: true, force: true }),
  };
}

describe("CLI serve command (smoke test)", () => {
  let ctx: Awaited<ReturnType<typeof createTestWorkspace>>;
  let embedder: MockEmbeddingProvider;
  let server: Server;

  beforeEach(async () => {
    ctx = await createTestWorkspace();
    embedder = new MockEmbeddingProvider(3072);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await ctx.cleanup();
  });

  it("starts a server and responds to /api/files", async () => {
    const app = createServer({
      wsPath: ctx.wsPath,
      embedder,
      port: 0,
      host: "127.0.0.1",
    });

    const address = await new Promise<{ port: number }>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        resolve(server.address() as { port: number });
      });
    });

    const response = await fetch(`http://127.0.0.1:${address.port}/api/files`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("items");
  });
});
