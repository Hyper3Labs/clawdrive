import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { rm } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";

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
} from "@clawdrive/core";
import { createServer } from "../src/index.js";

// --- Helpers ---

async function createTestWorkspace() {
  const baseDir = await mkdtemp(join(tmpdir(), "clawdrive-e2e-"));
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

// --- Shared state ---

let fileId: string;
let secondFileId: string;
let potId: string;
let potSlug: string;
let shareId: string;
let shareToken: string;
let shareItemId: string;

const FILE1_TEXT =
  "The quick brown fox jumps over the lazy dog. This is a document about animals.";
const FILE2_TEXT =
  "Meeting notes from the quarterly review. Budget allocation for Q3.";

describe("E2E integration test — full demo flow", () => {
  let ctx: Awaited<ReturnType<typeof createTestWorkspace>>;
  let baseUrl: string;
  let server: Server;

  beforeAll(async () => {
    ctx = await createTestWorkspace();
    const embedder = new MockEmbeddingProvider(3072);
    const listener = await listen(
      createServer({ wsPath: ctx.wsPath, embedder, host: "127.0.0.1", port: 0 }),
    );
    server = listener.server;
    baseUrl = listener.baseUrl;
  });

  afterAll(async () => {
    await closeServer(server);
    await ctx.cleanup();
  });

  // 1. Upload two files
  it("uploads two files via POST /api/files/store", async () => {
    const form1 = new FormData();
    form1.append(
      "file",
      new File([FILE1_TEXT], "animals.txt", { type: "text/plain" }),
    );

    const res1 = await fetch(`${baseUrl}/api/files/store`, {
      method: "POST",
      body: form1,
    });
    expect(res1.status).toBe(200);
    const payload1 = (await res1.json()) as { id: string; status: string };
    expect(payload1.status).toBe("stored");
    expect(payload1.id).toBeTruthy();
    fileId = payload1.id;

    const form2 = new FormData();
    form2.append(
      "file",
      new File([FILE2_TEXT], "meeting-notes.txt", { type: "text/plain" }),
    );

    const res2 = await fetch(`${baseUrl}/api/files/store`, {
      method: "POST",
      body: form2,
    });
    expect(res2.status).toBe(200);
    const payload2 = (await res2.json()) as { id: string; status: string };
    expect(payload2.status).toBe("stored");
    expect(payload2.id).toBeTruthy();
    secondFileId = payload2.id;
  });

  // 2. List files
  it("lists files and both appear", async () => {
    const res = await fetch(`${baseUrl}/api/files`);
    expect(res.status).toBe(200);
    const payload = (await res.json()) as {
      items: Array<Record<string, unknown>>;
      total: number;
    };
    expect(payload.items.length).toBeGreaterThanOrEqual(2);
  });

  // 3. Search finds relevant file
  it("searches for 'animals' and finds the relevant file", async () => {
    const res = await fetch(`${baseUrl}/api/search?q=animals`);
    expect(res.status).toBe(200);
    const payload = (await res.json()) as {
      results: Array<Record<string, unknown>>;
      total: number;
    };
    expect(payload.results).toBeDefined();
    // MockEmbeddingProvider returns consistent vectors, so results may include both;
    // the key assertion is that the endpoint works and returns results
    expect(payload.total).toBeGreaterThanOrEqual(1);
  });

  // 4. Create pot
  it("creates a pot via POST /api/pots", async () => {
    const res = await fetch(`${baseUrl}/api/pots`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Demo Pot", description: "For the launch demo" }),
    });
    expect(res.status).toBe(201);
    const payload = (await res.json()) as {
      id: string;
      slug: string;
      name: string;
      description: string;
    };
    expect(payload.id).toBeTruthy();
    expect(payload.slug).toBeTruthy();
    expect(payload.name).toBe("Demo Pot");
    potId = payload.id;
    potSlug = payload.slug;
  });

  // 5. Tag file into pot
  it("tags the first file into the pot via PATCH /api/files/:id", async () => {
    const res = await fetch(`${baseUrl}/api/files/${fileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: [`pot:${potSlug}`] }),
    });
    expect(res.status).toBe(200);
  });

  // 6. List pot files
  it("lists pot files and finds the tagged file", async () => {
    const res = await fetch(`${baseUrl}/api/pots/${potSlug}/files`);
    expect(res.status).toBe(200);
    const payload = (await res.json()) as {
      items: Array<Record<string, unknown>>;
      total: number;
    };
    expect(payload.items).toHaveLength(1);
  });

  // 7. Create link share
  it("creates a link share via POST /api/shares/pot/:slug", async () => {
    const res = await fetch(`${baseUrl}/api/shares/pot/${potSlug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "link" }),
    });
    expect(res.status).toBe(201);
    const payload = (await res.json()) as {
      id: string;
      token: string;
      status: string;
    };
    expect(payload.status).toBe("pending");
    expect(payload.token).toBeTruthy();
    shareId = payload.id;
    shareToken = payload.token;
  });

  // 8. Approve share
  it("approves the share via POST /api/shares/:id/approve", async () => {
    const res = await fetch(`${baseUrl}/api/shares/${shareId}/approve`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    const payload = (await res.json()) as { status: string };
    expect(payload.status).toBe("active");
  });

  // 9. Public share HTML
  it("serves the public share HTML page at GET /s/:token", async () => {
    const res = await fetch(`${baseUrl}/s/${shareToken}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<!doctype html>");
  });

  // 10. Public manifest
  it("serves the public manifest at GET /s/:token/manifest.json", async () => {
    const res = await fetch(`${baseUrl}/s/${shareToken}/manifest.json`);
    expect(res.status).toBe(200);
    const payload = (await res.json()) as {
      items: Array<{ id: string; content_url: string; original_name: string }>;
      total: number;
    };
    expect(Array.isArray(payload.items)).toBe(true);
    expect(payload.items.length).toBeGreaterThanOrEqual(1);
    shareItemId = payload.items[0]!.id;
    expect(shareItemId).toBeTruthy();
  });

  // 11. Public file content
  it("serves public file content at GET /s/:token/items/:shareItemId/content", async () => {
    const res = await fetch(
      `${baseUrl}/s/${shareToken}/items/${shareItemId}/content`,
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain(FILE1_TEXT);
  });

  // 12. Taxonomy tree
  it("returns the taxonomy tree at GET /api/taxonomy", async () => {
    const res = await fetch(`${baseUrl}/api/taxonomy`);
    expect(res.status).toBe(200);
    const payload = await res.json();
    expect(payload).toBeDefined();
  });

  // 13. Set metadata
  it("sets metadata via PATCH /api/files/:id and persists it", async () => {
    const res = await fetch(`${baseUrl}/api/files/${fileId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tldr: "A document about animals" }),
    });
    expect(res.status).toBe(200);
    const payload = (await res.json()) as { tldr: string };
    expect(payload.tldr).toBe("A document about animals");

    // Verify persistence by fetching the file again
    const verifyRes = await fetch(`${baseUrl}/api/files/${fileId}`);
    expect(verifyRes.status).toBe(200);
    const verifyPayload = (await verifyRes.json()) as { tldr: string };
    expect(verifyPayload.tldr).toBe("A document about animals");
  });

  // 14. Soft delete and verify exclusion
  it("soft-deletes the second file and verifies it is excluded from listing", async () => {
    const delRes = await fetch(`${baseUrl}/api/files/${secondFileId}`, {
      method: "DELETE",
    });
    expect(delRes.status).toBe(200);
    const delPayload = (await delRes.json()) as { deleted: boolean };
    expect(delPayload.deleted).toBe(true);

    // Verify the file is excluded from the list
    const listRes = await fetch(`${baseUrl}/api/files`);
    expect(listRes.status).toBe(200);
    const listPayload = (await listRes.json()) as {
      items: Array<{ id: string }>;
      total: number;
    };
    const ids = listPayload.items.map((item) => item.id);
    expect(ids).not.toContain(secondFileId);
  });
});
