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
  createDatabase,
  createPot,
  createPotShare,
  getFilesTable,
  initWorkspace,
  insertFileRecord,
  resolveWorkspacePath,
  store,
} from "@clawdrive/core";
import { createServer } from "../src/index.js";

async function createTestWorkspace() {
  const baseDir = await mkdtemp(join(tmpdir(), "clawdrive-metadata-routes-"));
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

describe("metadata routes", () => {
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

  it("projects file metadata for files, pots, and shares while keeping tags on an explicit endpoint", async () => {
    const pot = await createPot({ name: "Launch Docs" }, { wsPath: ctx.wsPath });
    const docPath = join(ctx.baseDir, "brief.md");
    const otherPath = join(ctx.baseDir, "other.md");
    const taggedPath = join(ctx.baseDir, "tagged.md");
    const sharedPath = join(ctx.baseDir, "shared.md");
    await writeFile(docPath, "# Brief\n\nMission brief body");
    await writeFile(otherPath, "# Other\n\nOther route metadata body");
    await writeFile(taggedPath, "# Tagged\n\nTagged route metadata body");
    await writeFile(sharedPath, "# Shared\n\nShared mission brief body");

    const stored = await store(
      {
        sourcePath: docPath,
        description: "Mission brief",
        digest: "# Mission Brief\n\nShort orientation paragraph.\n\n## Quick Navigation\n- Launch notes\n\n## Detailed Description\nLonger explanation.",
        sourceUrl: "https://example.com/brief.md",
      },
      { wsPath: ctx.wsPath, embedder },
    );
    const other = await store(
      {
        sourcePath: otherPath,
      },
      { wsPath: ctx.wsPath, embedder },
    );
    const tagged = await store(
      {
        sourcePath: taggedPath,
        tags: ["classified", "reviewed"],
      },
      { wsPath: ctx.wsPath, embedder },
    );
    await store(
      {
        sourcePath: sharedPath,
        tags: [buildPotTag(pot.slug)],
        description: "Shared mission brief",
      },
      { wsPath: ctx.wsPath, embedder },
    );

    const db = await createDatabase(join(ctx.wsPath, "db"));
    const table = await getFilesTable(db);
    for (const [id, taxonomyPath] of [
      [stored.id, ["All", "Docs"]],
      [other.id, ["All", "Other"]],
    ] as const) {
      const rows = await table.query().where(`id = '${id}'`).toArray();
      const row = { ...(rows[0] as Record<string, unknown>), taxonomy_path: taxonomyPath };
      await table.delete(`id = '${id}'`);
      await insertFileRecord(table, row);
    }

    const pending = await createPotShare(
      { pot: pot.slug, kind: "link", role: "read" },
      { wsPath: ctx.wsPath },
    );
    const approved = await approveShare(pending.id, { wsPath: ctx.wsPath });

    const listener = await listen(
      createServer({ wsPath: ctx.wsPath, embedder, host: "127.0.0.1", port: 0 }),
    );
    servers.push(listener.server);

    const listRes = await fetch(`${listener.baseUrl}/api/files?taxonomyPath=All/Docs`);
    expect(listRes.status).toBe(200);
    const listPayload = await listRes.json() as {
      total: number;
      items: Array<Record<string, unknown>>;
    };
    expect(listPayload.total).toBe(1);
    expect(listPayload.items[0]?.original_name).toBe("brief.md");
    expect(listPayload.items[0]?.tldr).toBe("Mission brief");
    expect(listPayload.items[0]?.source_url).toBe("https://example.com/brief.md");
    expect(listPayload.items[0]).not.toHaveProperty("digest");
    expect(listPayload.items[0]).not.toHaveProperty("tags");
    expect(listPayload.items[0]).not.toHaveProperty("taxonomy_path");
    expect(listPayload.items[0]).not.toHaveProperty("file_path");
    expect(listPayload.items[0]).not.toHaveProperty("description");
    expect(listPayload.items[0]).not.toHaveProperty("abstract");

    const fileRes = await fetch(`${listener.baseUrl}/api/files/${stored.id}`);
    expect(fileRes.status).toBe(200);
    const filePayload = await fileRes.json() as Record<string, unknown>;
    expect(filePayload.original_name).toBe("brief.md");
    expect(filePayload.tldr).toBe("Mission brief");
    expect(filePayload.digest).toBe("# Mission Brief\n\nShort orientation paragraph.\n\n## Quick Navigation\n- Launch notes\n\n## Detailed Description\nLonger explanation.");
    expect(filePayload).not.toHaveProperty("tags");
    expect(filePayload).not.toHaveProperty("taxonomy_path");
    expect(filePayload).not.toHaveProperty("abstract");

    const tagsRes = await fetch(`${listener.baseUrl}/api/files/${tagged.id}/tags`);
    expect(tagsRes.status).toBe(200);
    const tagsPayload = await tagsRes.json() as { tags: string[] };
    expect(tagsPayload.tags).toContain("classified");
    expect(tagsPayload.tags).toContain("reviewed");

    const potFilesRes = await fetch(`${listener.baseUrl}/api/pots/${pot.slug}/files`);
    expect(potFilesRes.status).toBe(200);
    const potFilesPayload = await potFilesRes.json() as { items: Array<Record<string, unknown>> };
    expect(potFilesPayload.items).toHaveLength(1);
    expect(potFilesPayload.items[0]).not.toHaveProperty("tags");
    expect(potFilesPayload.items[0]).not.toHaveProperty("file_path");

    const shareRes = await fetch(`${listener.baseUrl}/api/shares/${approved.token}`);
    expect(shareRes.status).toBe(200);
    const sharePayload = await shareRes.json() as { files: Array<Record<string, unknown>> };
    expect(sharePayload.files).toHaveLength(1);
    expect(sharePayload.files[0]?.tldr).toBe("Shared mission brief");
    expect(sharePayload.files[0]).not.toHaveProperty("tags");
    expect(sharePayload.files[0]).not.toHaveProperty("vector");
    expect(sharePayload.files[0]).not.toHaveProperty("file_path");
    expect(sharePayload.files[0]).not.toHaveProperty("abstract");
  });

  it("stores uploaded files using the original filename for MIME detection", async () => {
    const listener = await listen(
      createServer({ wsPath: ctx.wsPath, embedder, host: "127.0.0.1", port: 0 }),
    );
    servers.push(listener.server);

    const form = new FormData();
    form.append(
      "file",
      new File(["# Upload\n\nThis should be indexed as markdown."], "upload.md", {
        type: "text/markdown",
      }),
    );

    const uploadRes = await fetch(`${listener.baseUrl}/api/files/store`, {
      method: "POST",
      body: form,
    });

    expect(uploadRes.status).toBe(200);

    const uploadPayload = await uploadRes.json() as { id: string; status: string };
    expect(uploadPayload.status).toBe("stored");

    const fileRes = await fetch(`${listener.baseUrl}/api/files/${uploadPayload.id}`);
    expect(fileRes.status).toBe(200);

    const filePayload = await fileRes.json() as Record<string, unknown>;
    expect(filePayload.original_name).toBe("upload.md");
    expect(filePayload.content_type).toBe("text/markdown");
  });
});