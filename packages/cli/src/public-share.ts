import type { PotRecord, PotShare, ShareKind, ShareRole, ShareStatus } from "@clawdrive/core";

const MANIFEST_FILE_NAME = "manifest.json";

export interface PublicShareManifestItem {
  id: string;
  name: string;
  original_name: string;
  display_name?: string;
  content_type: string;
  file_size: number;
  created_at: number;
  updated_at: number;
  tldr?: string | null;
  source_url?: string;
  content_url: string;
  preview_url: string;
}

export interface PublicShareManifest {
  share: {
    id: string;
    kind: ShareKind;
    role: ShareRole;
    status: ShareStatus;
    expires_at: number | null;
    created_at: number;
    approved_at: number | null;
  };
  pot: PotRecord;
  items: PublicShareManifestItem[];
  total: number;
}

export interface LoadedPublicShareManifest {
  shareUrl: string;
  manifestUrl: string;
  manifest: PublicShareManifest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function ensureShareRootUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid public share URL: ${rawUrl}`);
  }

  if (url.pathname.includes("/items/")) {
    throw new Error("Use the public share URL or manifest.json URL, not an item content URL");
  }

  url.hash = "";
  url.search = "";

  if (url.pathname.endsWith(MANIFEST_FILE_NAME)) {
    url.pathname = url.pathname.slice(0, -MANIFEST_FILE_NAME.length);
  }

  if (!url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}/`;
  }

  return url;
}

function parsePublicShareManifest(payload: unknown): PublicShareManifest {
  if (!isRecord(payload)) {
    throw new Error("Public share manifest must be a JSON object");
  }

  const { share, pot, items, total } = payload;
  if (!isRecord(share) || !isRecord(pot) || !Array.isArray(items) || typeof total !== "number") {
    throw new Error("Public share manifest is missing required fields");
  }

  return payload as unknown as PublicShareManifest;
}

async function buildFetchError(response: Response): Promise<string> {
  const body = await response.text();
  if (!body) {
    return `${response.status} ${response.statusText}`;
  }

  try {
    const payload = JSON.parse(body) as { error?: string };
    if (payload.error) {
      return `${response.status} ${response.statusText}: ${payload.error}`;
    }
  } catch {
    // Ignore non-JSON bodies and fall back to the raw text.
  }

  return `${response.status} ${response.statusText}: ${body}`;
}

export async function fetchPublicShareManifest(rawUrl: string): Promise<LoadedPublicShareManifest> {
  const shareRoot = ensureShareRootUrl(rawUrl);
  const manifestUrl = new URL(MANIFEST_FILE_NAME, shareRoot);
  const response = await fetch(manifestUrl);

  if (!response.ok) {
    throw new Error(`Failed to load public share manifest: ${await buildFetchError(response)}`);
  }

  const manifest = parsePublicShareManifest(await response.json());
  return {
    shareUrl: shareRoot.toString(),
    manifestUrl: manifestUrl.toString(),
    manifest,
  };
}

export function selectPublicShareItems(
  manifest: PublicShareManifest,
  itemIds: string[],
): PublicShareManifestItem[] {
  if (itemIds.length === 0) {
    return manifest.items;
  }

  const wanted = new Set(itemIds);
  const selected = manifest.items.filter((item) => wanted.has(item.id));
  const selectedIds = new Set(selected.map((item) => item.id));
  const missing = [...wanted].filter((itemId) => !selectedIds.has(itemId));
  if (missing.length > 0) {
    throw new Error(`Shared item not found: ${missing.join(", ")}`);
  }

  return selected;
}

export function formatBytes(bytes: number): string {
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