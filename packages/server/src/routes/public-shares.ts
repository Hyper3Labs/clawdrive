import { Router } from "express";
import type { RequestHandler, Response } from "express";
import {
  getPublicShare,
  resolvePublicShare,
  resolvePublicShareItem,
  getThumbnail,
} from "@clawdrive/core";
import { createReadStream } from "node:fs";
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

type Modality = "image" | "video" | "audio" | "pdf" | "text";

function getModality(contentType: string): Modality {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("audio/")) return "audio";
  if (contentType === "application/pdf") return "pdf";
  return "text";
}

function getModalityLabel(modality: Modality): string {
  const labels: Record<Modality, string> = { image: "IMG", video: "VID", audio: "AUD", pdf: "PDF", text: "TXT" };
  return labels[modality];
}

interface ModalityStyle { color: string; borderColor: string; background: string; gradient: string }

function getModalityStyle(modality: Modality): ModalityStyle {
  const styles: Record<Modality, ModalityStyle> = {
    image: { color: "#7BD389", borderColor: "rgba(123,211,137,0.4)", background: "rgba(123,211,137,0.12)", gradient: "linear-gradient(135deg,#0f2a1f,#0a1a15)" },
    pdf: { color: "#8AB4FF", borderColor: "rgba(138,180,255,0.4)", background: "rgba(138,180,255,0.12)", gradient: "linear-gradient(135deg,#0f1a2f,#0a1225)" },
    video: { color: "#C792EA", borderColor: "rgba(199,146,234,0.4)", background: "rgba(199,146,234,0.12)", gradient: "linear-gradient(135deg,#1a0f2a,#120a20)" },
    audio: { color: "#F6C177", borderColor: "rgba(246,193,119,0.4)", background: "rgba(246,193,119,0.12)", gradient: "linear-gradient(135deg,#2a2a1a,#1a150a)" },
    text: { color: "#9AD1FF", borderColor: "rgba(154,209,255,0.4)", background: "rgba(154,209,255,0.12)", gradient: "linear-gradient(135deg,#0f1a2a,#0a1520)" },
  };
  return styles[modality];
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
    <title>${escapeHtml(title)} &middot; ClawDrive</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: "Manrope", "Avenir Next", "Segoe UI", sans-serif; background: #061018; color: #E6F0F7; min-height: 100vh; }
      .topbar {
        display: flex; align-items: center; padding: 12px 20px;
        border-bottom: 1px solid #1F3647;
        background: linear-gradient(180deg, rgba(8,21,31,0.95) 0%, rgba(6,16,24,0.95) 100%);
      }
      .logo { font-weight: 700; font-size: 15px; color: #E6F0F7; }
      main { max-width: 720px; margin: 0 auto; padding: 48px 24px 64px; }
      .card {
        background: rgba(14, 26, 36, 0.6); border: 1px solid #1F3647;
        border-radius: 8px; padding: 24px;
      }
      h1 { margin: 0 0 12px; font-size: 22px; font-weight: 700; }
      p { margin: 0; color: #6B8A9E; line-height: 1.6; }
    </style>
  </head>
  <body>
    <div class="topbar">
      <span class="logo">ClawDrive</span>
    </div>
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

  const items = manifest.items.map((item) => {
    const modality = getModality(item.content_type);
    const label = getModalityLabel(modality);
    const style = getModalityStyle(modality);
    const thumbUrl = buildDirectSharePath(token, item.thumbnail_url);
    const contentUrl = buildDirectSharePath(token, item.content_url);
    const tldrHtml = item.tldr
      ? `<div class="file-tldr">${escapeHtml(item.tldr)}</div>`
      : "";

    return `
      <div class="file-card">
        <div class="thumb" style="position:relative">
          <img src="${thumbUrl}" data-relative-href="${escapeHtml(item.thumbnail_url)}" alt="${escapeHtml(item.original_name)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
          <div class="thumb-fallback" style="display:none;height:120px;background:${style.gradient};align-items:center;justify-content:center">
            <span style="color:${style.color};font-size:12px;font-family:'SF Mono','Fira Code',monospace;letter-spacing:1px">${label}</span>
          </div>
          <span class="modality-badge" style="color:${style.color};border-color:${style.borderColor};background:${style.background}">${label}</span>
        </div>
        <div class="card-body">
          <div class="file-name">${escapeHtml(item.original_name)}</div>
          <div class="file-meta">${escapeHtml(item.content_type)} &middot; ${formatBytes(item.file_size)}</div>
          ${tldrHtml}
          <a class="download-btn" href="${contentUrl}" data-relative-href="${escapeHtml(item.content_url)}" download>&#8595; Download</a>
        </div>
      </div>`;
  }).join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(manifest.pot.name)} &middot; ClawDrive Share</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: "Manrope", "Avenir Next", "Segoe UI", sans-serif; background: #061018; color: #E6F0F7; min-height: 100vh; }
      a { color: #6EE7FF; text-decoration: none; }
      a:hover { text-decoration: underline; }

      .topbar {
        display: flex; align-items: center; padding: 12px 20px;
        border-bottom: 1px solid #1F3647;
        background: linear-gradient(180deg, rgba(8,21,31,0.95) 0%, rgba(6,16,24,0.95) 100%);
        position: sticky; top: 0; z-index: 10;
      }
      .logo { font-weight: 700; font-size: 15px; color: #E6F0F7; }
      .topbar-right { margin-left: auto; display: flex; align-items: center; gap: 10px; }
      .badge-shared {
        padding: 4px 12px; border-radius: 6px; font-size: 11px; font-weight: 600;
        background: rgba(110, 231, 255, 0.12); color: #6EE7FF; letter-spacing: 0.5px;
        text-transform: uppercase;
      }

      .content { max-width: 1080px; margin: 0 auto; padding: 28px 24px 64px; }

      .pot-info {
        padding: 20px 24px; border-radius: 8px;
        background: rgba(14, 26, 36, 0.6);
        border: 1px solid #1F3647; margin-bottom: 24px;
      }
      .pot-name { font-size: 22px; font-weight: 700; margin-bottom: 6px; }
      .pot-desc { font-size: 13px; color: #6B8A9E; line-height: 1.5; margin-bottom: 14px; }
      .pot-stats { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
      .stat-pill {
        padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 500;
        background: rgba(255,255,255,0.05); color: #6B8A9E;
      }
      .stat-pill.accent { background: rgba(110, 231, 255, 0.08); color: #6EE7FF; }
      .manifest-link {
        font-size: 11px; color: #6EE7FF; text-decoration: none; margin-left: auto;
        opacity: 0.6; font-family: 'SF Mono', 'Fira Code', monospace;
      }
      .manifest-link:hover { opacity: 1; }

      .section-label {
        font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px;
        color: #6B8A9E; font-weight: 600; margin-bottom: 14px;
      }

      .file-grid { column-count: 4; column-gap: 12px; }
      @media (max-width: 900px) { .file-grid { column-count: 3; } }
      @media (max-width: 640px) { .file-grid { column-count: 2; } }
      @media (max-width: 400px) { .file-grid { column-count: 1; } }

      .file-card {
        break-inside: avoid; margin-bottom: 12px; border-radius: 8px;
        background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07);
        overflow: hidden; transition: background 0.15s, border-color 0.15s, transform 0.15s;
      }
      .file-card:hover {
        background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.14);
        transform: translateY(-2px);
      }

      .thumb { position: relative; }
      .thumb img { width: 100%; display: block; }

      .modality-badge {
        position: absolute; top: 8px; left: 8px;
        padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 600;
        letter-spacing: 0.8px; border: 1px solid;
      }

      .card-body { padding: 10px 12px; }
      .file-name { font-size: 12px; font-weight: 600; color: #E6F0F7; word-break: break-word; }
      .file-meta { font-size: 11px; color: #6B8A9E; margin-top: 2px; }
      .file-tldr { font-size: 11px; color: rgba(230,240,247,0.55); margin-top: 6px; line-height: 1.45; }

      .download-btn {
        display: inline-flex; align-items: center; gap: 4px; margin-top: 8px;
        padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 500;
        background: rgba(110,231,255,0.08); color: #6EE7FF; border: 1px solid rgba(110,231,255,0.2);
        text-decoration: none; transition: background 0.15s;
      }
      .download-btn:hover { background: rgba(110,231,255,0.16); text-decoration: none; }
    </style>
  </head>
  <body>
    <div class="topbar">
      <span class="logo">ClawDrive</span>
      <div class="topbar-right">
        <span class="badge-shared">Public Share</span>
      </div>
    </div>
    <div class="content">
      <div class="pot-info">
        <div class="pot-name">${escapeHtml(manifest.pot.name)}</div>
        <div class="pot-desc">${manifest.pot.description ? escapeHtml(manifest.pot.description) : "Shared from ClawDrive"}</div>
        <div class="pot-stats">
          <span class="stat-pill accent">${manifest.total} item${manifest.total === 1 ? "" : "s"}</span>
          <span class="stat-pill">Role: ${escapeHtml(manifest.share.role)}</span>
          <span class="stat-pill">${escapeHtml(expiresAt)}</span>
          <a class="manifest-link" href="${buildDirectSharePath(token, "manifest.json")}" data-relative-href="manifest.json">manifest.json</a>
        </div>
      </div>
      <div class="section-label">Files</div>
      <div class="file-grid">${items}</div>
    </div>
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
          if (!relativeHref) continue;
          const attr = link.tagName === "IMG" ? "src" : "href";
          link.setAttribute(attr, new URL(relativeHref, baseUrl).toString());
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