import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";

vi.mock("sharp", () => {
  const TINY_JPEG = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]);

  const chain = {
    resize: () => chain,
    jpeg: () => chain,
    toFile: async (dest: string) => {
      const { mkdir, writeFile } = await import("node:fs/promises");
      const { dirname } = await import("node:path");
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, TINY_JPEG);
    },
  };

  return {
    default: () => chain,
  };
});

import {
  MockEmbeddingProvider,
  buildPotTag,
  createPot,
  createPotShare,
  approveShare,
  initWorkspace,
  resolveWorkspacePath,
  store,
} from "@clawdrive/core";
import { createPublicShareServer } from "../src/public.js";

async function createTestWorkspace() {
  const baseDir = await mkdtemp(join(tmpdir(), "clawdrive-server-test-"));
  const wsPath = resolveWorkspacePath(baseDir, "test");
  await initWorkspace(wsPath);
  return {
    baseDir,
    wsPath,
    cleanup: () => rm(baseDir, { recursive: true }),
  };
}

async function listen(app: ReturnType<typeof createPublicShareServer>) {
  return new Promise<{ server: Server; baseUrl: string }>((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => {
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

describe("public share routes", () => {
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

  it("serves share-scoped manifests and downloads without exposing private APIs", async () => {
    const pot = await createPot({ name: "Public Pot" }, { wsPath: ctx.wsPath });
    const src = join(ctx.baseDir, "brief.md");
    await writeFile(src, "classified but shareable");

    await store(
      {
        sourcePath: src,
        tags: [buildPotTag(pot.slug)],
        description: "Mission brief",
      },
      { wsPath: ctx.wsPath, embedder },
    );

    const pending = await createPotShare(
      { pot: pot.slug, kind: "link", role: "read" },
      { wsPath: ctx.wsPath },
    );
    const approved = await approveShare(pending.id, { wsPath: ctx.wsPath });

    const publicApp = createPublicShareServer({ wsPath: ctx.wsPath });
    const publicListener = await listen(publicApp);
    servers.push(publicListener.server);

    const proxyApp = express();
    proxyApp.use((req, _res, next) => {
      req.url = `/s/${approved.token}${req.url === "/" ? "" : req.url}`;
      next();
    });
    proxyApp.use(publicApp);

    const proxyListener = await listen(proxyApp);
    servers.push(proxyListener.server);

    const manifestRes = await fetch(`${publicListener.baseUrl}/s/${approved.token}/manifest.json`);
    expect(manifestRes.status).toBe(200);
    const manifest = await manifestRes.json() as {
      total: number;
      items: Array<{ original_name: string; content_url: string; preview_url: string; thumbnail_url: string; tldr?: string }>;
    };
    expect(manifest.total).toBe(1);
    expect(manifest.items[0]?.original_name).toBe("brief.md");
    expect(manifest.items[0]?.tldr).toBe("Mission brief");
    expect(manifest.items[0]?.content_url).toMatch(/^items\/[^/]+\/content$/);
    expect(manifest.items[0]?.preview_url).toMatch(/^items\/[^/]+\/preview$/);
    expect(manifest.items[0]?.thumbnail_url).toMatch(/^items\/[^/]+\/thumbnail$/);
    expect(manifest.items[0]).not.toHaveProperty("abstract");

    const contentRes = await fetch(new URL(manifest.items[0]!.content_url, manifestRes.url));
    expect(contentRes.status).toBe(200);
    expect(await contentRes.text()).toBe("classified but shareable");

    const previewRes = await fetch(new URL(manifest.items[0]!.preview_url, manifestRes.url));
    expect(previewRes.status).toBe(200);

    const thumbUrl = manifest.items[0]!.content_url.replace("/content", "/thumbnail");
    const thumbRes = await fetch(new URL(thumbUrl, manifestRes.url));
    expect(thumbRes.status).toBe(200);
    expect(thumbRes.headers.get("content-type")).toMatch(/image\/jpeg/);

    const blockedRes = await fetch(`${publicListener.baseUrl}/api/files`);
    expect(blockedRes.status).toBe(404);

    const pageRes = await fetch(`${publicListener.baseUrl}/s/${approved.token}`);
    expect(pageRes.status).toBe(200);
    const pageHtml = await pageRes.text();
    expect(pageHtml).toContain("Public Pot");
    expect(pageHtml).toContain('data-relative-href="manifest.json"');
    expect(pageHtml).toContain("window.location.pathname");

    const proxiedManifestRes = await fetch(`${proxyListener.baseUrl}/manifest.json`);
    expect(proxiedManifestRes.status).toBe(200);
    const proxiedManifest = await proxiedManifestRes.json() as {
      total: number;
      items: Array<{ original_name: string; content_url: string; preview_url: string; thumbnail_url: string; tldr?: string }>;
    };
    expect(proxiedManifest.total).toBe(1);
    expect(proxiedManifest.items[0]?.tldr).toBe("Mission brief");
    expect(proxiedManifest.items[0]?.content_url).toMatch(/^items\/[^/]+\/content$/);

    const proxiedContentRes = await fetch(new URL(proxiedManifest.items[0]!.content_url, proxiedManifestRes.url));
    expect(proxiedContentRes.status).toBe(200);
    expect(await proxiedContentRes.text()).toBe("classified but shareable");

    const proxiedPreviewRes = await fetch(new URL(proxiedManifest.items[0]!.preview_url, proxiedManifestRes.url));
    expect(proxiedPreviewRes.status).toBe(200);

    const proxiedThumbUrl = proxiedManifest.items[0]!.content_url.replace("/content", "/thumbnail");
    const proxiedThumbRes = await fetch(new URL(proxiedThumbUrl, proxiedManifestRes.url));
    expect(proxiedThumbRes.status).toBe(200);

    const proxiedBlockedRes = await fetch(`${proxyListener.baseUrl}/api/files`);
    expect(proxiedBlockedRes.status).toBe(404);

    const proxiedPageRes = await fetch(proxyListener.baseUrl);
    expect(proxiedPageRes.status).toBe(200);
    const proxiedPageHtml = await proxiedPageRes.text();
    expect(proxiedPageHtml).toContain('data-relative-href="manifest.json"');
  });
});