import { Router } from "express";
import type { RequestHandler, Response } from "express";
import {
  getPublicShare,
  resolvePublicShare,
  resolvePublicShareItem,
  getThumbnail,
} from "@clawdrive/core";
import { join } from "node:path";
import { streamFilePath } from "../lib/file-stream.js";
import { toShareItemMetadataRecord } from "../lib/file-metadata.js";

const CACHE_CONTROL = "private, max-age=60";

interface ShareParams {
  token: string;
}

interface ShareItemParams extends ShareParams {
  shareItemId: string;
}

type ActiveShareLookup =
  | { kind: "missing" }
  | { kind: "inactive"; share: NonNullable<Awaited<ReturnType<typeof getPublicShare>>> }
  | { kind: "ok"; resolved: NonNullable<Awaited<ReturnType<typeof resolvePublicShare>>> };

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

function buildShareItemPath(shareItemId: string, mode: "content" | "preview" | "thumbnail"): string {
  return `items/${encodeURIComponent(shareItemId)}/${mode}`;
}

function buildDirectSharePath(token: string, relativePath: string): string {
  return `/s/${encodeURIComponent(token)}/${relativePath}`;
}

function buildManifest(token: string, resolved: NonNullable<Awaited<ReturnType<typeof resolvePublicShare>>>) {
  return {
    share: {
      id: resolved.share.id,
      kind: resolved.share.kind,
      role: resolved.share.role,
      status: resolved.share.status,
      expires_at: resolved.share.expires_at,
      created_at: resolved.share.created_at,
      approved_at: resolved.share.approved_at,
    },
    pot: resolved.pot,
    items: resolved.items.map((item) => ({
      ...toShareItemMetadataRecord(item),
      content_url: buildShareItemPath(item.id, "content"),
      preview_url: buildShareItemPath(item.id, "preview"),
      thumbnail_url: buildShareItemPath(item.id, "thumbnail"),
    })),
    total: resolved.items.length,
  };
}

async function lookupActiveShare(token: string, wsPath: string): Promise<ActiveShareLookup> {
  const share = await getPublicShare(token, { wsPath });
  if (!share) {
    return { kind: "missing" };
  }

  if (share.status !== "active") {
    return { kind: "inactive", share };
  }

  const resolved = await resolvePublicShare(token, { wsPath });
  if (!resolved) {
    return { kind: "missing" };
  }

  return { kind: "ok", resolved };
}

function sendShareJsonStatus(res: Response, lookup: Exclude<ActiveShareLookup, { kind: "ok" }>) {
  if (lookup.kind === "missing") {
    res.status(404).json({ error: "Share not found" });
    return;
  }

  res.status(409).json({ error: `Share is ${lookup.share.status}`, share: lookup.share });
}

function sendShareHtmlStatus(res: Response, lookup: Exclude<ActiveShareLookup, { kind: "ok" }>) {
  if (lookup.kind === "missing") {
    res.status(404).type("html").send(renderStatusPage("Share not found", "This public share does not exist or has already been removed."));
    return;
  }

  res.status(409).type("html").send(renderStatusPage(`Share is ${lookup.share.status}`, "This public share is not currently available."));
}

function createPublicShareItemStreamHandler(wsPath: string): RequestHandler<ShareItemParams> {
  return async (req, res, next) => {
    try {
      const lookup = await lookupActiveShare(req.params.token, wsPath);
      if (lookup.kind !== "ok") {
        sendShareJsonStatus(res, lookup);
        return;
      }

      const resolved = await resolvePublicShareItem(req.params.token, req.params.shareItemId, { wsPath });
      if (!resolved) {
        res.status(404).json({ error: "Shared item not found" });
        return;
      }

      res.set("Cache-Control", CACHE_CONTROL);
      const filePath = join(wsPath, "files", resolved.file.file_path);
      streamFilePath(filePath, resolved.file.content_type, res);
    } catch (err) {
      next(err);
    }
  };
}

function renderStatusPage(title: string, detail: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <style>
      body { margin: 0; font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #101820; color: #f3f5f7; }
      main { max-width: 720px; margin: 0 auto; padding: 48px 24px 64px; }
      .card { background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 18px; padding: 24px; }
      h1 { margin: 0 0 12px; font-size: 28px; }
      p { margin: 0; color: rgba(243, 245, 247, 0.72); line-height: 1.6; }
    </style>
  </head>
  <body>
    <main>
      <section class="card">
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(detail)}</p>
      </section>
    </main>
  </body>
</html>`;
}

function renderSharePage(manifest: ReturnType<typeof buildManifest>, token: string): string {
  const expiresAt = manifest.share.expires_at
    ? new Date(manifest.share.expires_at).toLocaleString()
    : "No expiry";
  const items = manifest.items.map((item) => `
        <li>
          <div class="item-row">
            <div>
              <a href="${buildDirectSharePath(token, item.content_url)}" data-relative-href="${escapeHtml(item.content_url)}">${escapeHtml(item.original_name)}</a>
              <div class="meta">${escapeHtml(item.content_type)} · ${formatBytes(item.file_size)}</div>
            </div>
            <div class="actions">
              <a href="${buildDirectSharePath(token, item.preview_url)}" data-relative-href="${escapeHtml(item.preview_url)}">Preview</a>
              <a href="${buildDirectSharePath(token, item.content_url)}" data-relative-href="${escapeHtml(item.content_url)}">Download</a>
            </div>
          </div>
          ${item.tldr ? `<p class="tldr">${escapeHtml(item.tldr)}</p>` : ""}
        </li>`).join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(manifest.pot.name)} · ClawDrive Share</title>
    <style>
      body { margin: 0; font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0b1220; color: #e8edf2; }
      main { max-width: 920px; margin: 0 auto; padding: 40px 20px 72px; }
      .hero { padding: 28px; border-radius: 22px; background: linear-gradient(135deg, rgba(41, 98, 255, 0.18), rgba(12, 18, 33, 0.92)); border: 1px solid rgba(160, 190, 255, 0.18); }
      h1 { margin: 0 0 10px; font-size: 36px; line-height: 1.1; }
      .subtitle { margin: 0; color: rgba(232, 237, 242, 0.78); line-height: 1.6; }
      .stats { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 18px; }
      .stat { padding: 8px 12px; border-radius: 999px; background: rgba(255, 255, 255, 0.07); color: rgba(232, 237, 242, 0.88); font-size: 13px; }
      .manifest-link { margin-top: 16px; display: inline-block; color: #9dc1ff; }
      ul { list-style: none; padding: 0; margin: 28px 0 0; display: grid; gap: 14px; }
      li { padding: 18px; border-radius: 18px; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); }
      .item-row { display: flex; justify-content: space-between; gap: 16px; align-items: baseline; }
      .meta { margin-top: 4px; color: rgba(232, 237, 242, 0.56); font-size: 13px; }
      .actions { display: flex; gap: 12px; flex-wrap: wrap; }
      .actions a, a { color: #9dc1ff; text-decoration: none; }
      .actions a:hover, a:hover { text-decoration: underline; }
      .tldr { margin: 10px 0 0; color: rgba(232, 237, 242, 0.78); line-height: 1.6; }
      @media (max-width: 720px) {
        h1 { font-size: 28px; }
        .item-row { flex-direction: column; align-items: flex-start; }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <h1>${escapeHtml(manifest.pot.name)}</h1>
        <p class="subtitle">${manifest.pot.description ? escapeHtml(manifest.pot.description) : "Shared from ClawDrive as a public capability link."}</p>
        <div class="stats">
          <span class="stat">${manifest.total} item${manifest.total === 1 ? "" : "s"}</span>
          <span class="stat">Role: ${escapeHtml(manifest.share.role)}</span>
          <span class="stat">${escapeHtml(expiresAt)}</span>
        </div>
        <a class="manifest-link" href="${buildDirectSharePath(token, "manifest.json")}" data-relative-href="manifest.json">manifest.json</a>
      </section>
      <ul>${items}</ul>
    </main>
    <script>
      (() => {
        const currentPath = window.location.pathname || "/";
        const basePath = currentPath === "/"
          ? "/"
          : currentPath.endsWith("/")
            ? currentPath
            : currentPath + "/";
        const baseUrl = new URL(basePath, window.location.origin);

        for (const link of document.querySelectorAll("[data-relative-href]")) {
          const relativeHref = link.getAttribute("data-relative-href");
          if (!relativeHref) {
            continue;
          }

          link.setAttribute("href", new URL(relativeHref, baseUrl).toString());
        }
      })();
    </script>
  </body>
</html>`;
}

export function createPublicShareRoutes(wsPath: string): Router {
  const router = Router();
  const streamPublicShareItem = createPublicShareItemStreamHandler(wsPath);

  router.get("/:token/manifest.json", async (req, res, next) => {
    try {
      const lookup = await lookupActiveShare(req.params.token, wsPath);
      if (lookup.kind !== "ok") {
        sendShareJsonStatus(res, lookup);
        return;
      }

      res.set("Cache-Control", CACHE_CONTROL);
      res.json(buildManifest(req.params.token, lookup.resolved));
    } catch (err) {
      next(err);
    }
  });

  router.get("/:token/items/:shareItemId/content", streamPublicShareItem);

  router.get("/:token/items/:shareItemId/preview", streamPublicShareItem);

  router.get("/:token/items/:shareItemId/thumbnail", async (req, res, next) => {
    try {
      const lookup = await lookupActiveShare(req.params.token, wsPath);
      if (lookup.kind !== "ok") {
        sendShareJsonStatus(res, lookup);
        return;
      }

      const resolved = await resolvePublicShareItem(req.params.token, req.params.shareItemId, { wsPath });
      if (!resolved) {
        res.status(404).json({ error: "Shared item not found" });
        return;
      }

      const cacheDir = join(wsPath, "thumbnails");
      const filePath = join(wsPath, "files", resolved.file.file_path);
      const thumbPath = await getThumbnail(filePath, resolved.file.content_type, cacheDir, resolved.file.id);

      if (!thumbPath) {
        res.status(404).end();
        return;
      }

      res.set("Content-Type", "image/jpeg");
      res.set("Cache-Control", "public, max-age=86400");
      const { createReadStream } = await import("node:fs");
      createReadStream(thumbPath).pipe(res);
    } catch (err) {
      next(err);
    }
  });

  router.get("/:token", async (req, res, next) => {
    try {
      const lookup = await lookupActiveShare(req.params.token, wsPath);
      if (lookup.kind !== "ok") {
        sendShareHtmlStatus(res, lookup);
        return;
      }

      res.set("Cache-Control", CACHE_CONTROL);
      res.type("html").send(renderSharePage(buildManifest(req.params.token, lookup.resolved), req.params.token));
    } catch (err) {
      next(err);
    }
  });

  return router;
}