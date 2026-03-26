import { randomBytes } from "node:crypto";
import { uuidv7 } from "uuidv7";
import type {
  FileRecord,
  PotShare,
  ResolvedPublicShare,
  ResolvedPublicShareItem,
  ResolvedShare,
  ShareItemRecord,
  ShareKind,
  ShareRole,
} from "./types.js";
import { acquireLock } from "./lock.js";
import { readWorkspaceJson, updateWorkspaceJson, writeWorkspaceJson } from "./metadata.js";
import { listPotFiles, requirePot } from "./pots.js";
import { getFileInfo } from "./read.js";

const SHARES_FILE = "shares.json";
const SHARE_ITEMS_FILE = "share-items.json";

export interface ShareOptions {
  wsPath: string;
}

export interface CreatePotShareInput {
  pot: string;
  kind: ShareKind;
  principal?: string;
  role?: ShareRole;
  expiresAt?: number;
}

function createShareToken(): string {
  return randomBytes(18).toString("base64url");
}

function normalizeShare(share: PotShare): PotShare {
  if (
    share.status !== "revoked" &&
    share.expires_at != null &&
    share.expires_at <= Date.now()
  ) {
    return {
      ...share,
      status: "expired",
    };
  }

  return share;
}

function createShareItemRecord(
  shareId: string,
  file: FileRecord,
  sharedAt: number,
): ShareItemRecord {
  const tldr = file.tldr ?? file.abstract ?? file.description ?? null;

  return {
    id: uuidv7(),
    share_id: shareId,
    file_id: file.id,
    original_name: file.original_name,
    display_name: file.display_name ?? null,
    content_type: file.content_type,
    file_size: file.file_size,
    tldr,
    abstract: tldr,
    created_at: file.created_at,
    updated_at: file.updated_at,
    source_url: file.source_url,
    shared_at: sharedAt,
  };
}

function normalizeShareItemRecord(item: ShareItemRecord): ShareItemRecord {
  const tldr = item.tldr ?? item.abstract ?? null;
  return {
    ...item,
    tldr,
    abstract: tldr,
  };
}

function findShareIndex(shares: PotShare[], ref: string): number {
  const directIndex = shares.findIndex((share) => share.id === ref || share.token === ref);
  if (directIndex >= 0) {
    return directIndex;
  }

  const prefixMatches = shares
    .map((share, index) => ({ share, index }))
    .filter(({ share }) => share.id.startsWith(ref));

  if (prefixMatches.length > 1) {
    throw new Error(`Share ref is ambiguous: ${ref}`);
  }

  return prefixMatches[0]?.index ?? -1;
}

function findPublicShareByToken(shares: PotShare[], token: string): PotShare | null {
  return shares
    .map(normalizeShare)
    .find((share) => share.kind === "link" && share.token === token) ?? null;
}

async function readShareItems(wsPath: string): Promise<ShareItemRecord[]> {
  const items = await readWorkspaceJson(wsPath, SHARE_ITEMS_FILE, [] as ShareItemRecord[]);
  return items.map(normalizeShareItemRecord);
}

async function listShareItemsByShareId(shareId: string, opts: ShareOptions): Promise<ShareItemRecord[]> {
  const items = await readShareItems(opts.wsPath);
  return items.filter((item) => item.share_id === shareId);
}

async function ensureShareItems(share: PotShare, opts: ShareOptions): Promise<ShareItemRecord[]> {
  const existing = await listShareItemsByShareId(share.id, opts);
  if (existing.length > 0) {
    return existing;
  }

  const files = await listPotFiles(share.pot_slug, opts);
  const snapshot = files.map((file) => createShareItemRecord(share.id, file, share.created_at));
  if (snapshot.length === 0) {
    return snapshot;
  }

  const release = await acquireLock(opts.wsPath);
  try {
    const shareItems = await readShareItems(opts.wsPath);
    const current = shareItems.filter((item) => item.share_id === share.id);
    if (current.length > 0) {
      return current;
    }

    await writeWorkspaceJson(opts.wsPath, SHARE_ITEMS_FILE, [...shareItems, ...snapshot]);
    return snapshot;
  } finally {
    await release();
  }
}

export async function listPotShares(
  potRef: string,
  opts: { wsPath: string },
): Promise<PotShare[]> {
  const pot = await requirePot(potRef, opts);
  const all = await listShares(opts);
  return all.filter((s) => s.pot_id === pot.id);
}

export async function listShares(opts: ShareOptions): Promise<PotShare[]> {
  const shares = await readWorkspaceJson(opts.wsPath, SHARES_FILE, [] as PotShare[]);
  return shares
    .map(normalizeShare)
    .sort((left, right) => right.created_at - left.created_at);
}

export async function listShareInbox(opts: ShareOptions): Promise<PotShare[]> {
  const shares = await listShares(opts);
  return shares.filter((share) => share.kind === "link" && share.status === "pending");
}

export async function getShare(ref: string, opts: ShareOptions): Promise<PotShare | null> {
  const shares = await listShares(opts);
  const index = findShareIndex(shares, ref);
  if (index < 0) {
    return null;
  }
  return shares[index] ?? null;
}

export async function createPotShare(
  input: CreatePotShareInput,
  opts: ShareOptions,
): Promise<PotShare> {
  const pot = await requirePot(input.pot, opts);
  const files = await listPotFiles(pot.slug, opts);
  if (input.kind === "principal" && !input.principal?.trim()) {
    throw new Error("Principal is required for direct shares");
  }
  if (input.expiresAt != null && input.expiresAt <= Date.now()) {
    throw new Error("Share expiry must be in the future");
  }

  const now = Date.now();
  const share: PotShare = {
    id: uuidv7(),
    pot_id: pot.id,
    pot_slug: pot.slug,
    kind: input.kind,
    principal: input.kind === "principal" ? input.principal!.trim() : null,
    role: input.role ?? "read",
    status: input.kind === "link" ? "pending" : "active",
    token: input.kind === "link" ? createShareToken() : null,
    expires_at: input.expiresAt ?? null,
    created_at: now,
    approved_at: input.kind === "principal" ? now : null,
    revoked_at: null,
  };
  const shareItems = files.map((file) => createShareItemRecord(share.id, file, now));

  const release = await acquireLock(opts.wsPath);
  try {
    const shares = await readWorkspaceJson(opts.wsPath, SHARES_FILE, [] as PotShare[]);
    const existingItems = await readShareItems(opts.wsPath);
    await writeWorkspaceJson(opts.wsPath, SHARES_FILE, [...shares, share]);
    await writeWorkspaceJson(opts.wsPath, SHARE_ITEMS_FILE, [...existingItems, ...shareItems]);
    return normalizeShare(share);
  } finally {
    await release();
  }
}

export async function approveShare(ref: string, opts: ShareOptions): Promise<PotShare> {
  return updateWorkspaceJson(opts.wsPath, SHARES_FILE, [] as PotShare[], (shares) => {
    const index = findShareIndex(shares, ref);
    if (index < 0) {
      throw new Error(`Share not found: ${ref}`);
    }

    const current = normalizeShare(shares[index]);
    if (current.status === "expired") {
      throw new Error("Cannot approve an expired share request");
    }
    if (current.status === "revoked") {
      throw new Error("Cannot approve a revoked share request");
    }
    if (current.status === "active") {
      return {
        next: shares,
        result: current,
      };
    }

    const approved: PotShare = {
      ...shares[index],
      status: "active",
      approved_at: Date.now(),
    };
    const next = [...shares];
    next[index] = approved;

    return {
      next,
      result: normalizeShare(approved),
    };
  });
}

export async function revokeShare(ref: string, opts: ShareOptions): Promise<PotShare> {
  return updateWorkspaceJson(opts.wsPath, SHARES_FILE, [] as PotShare[], (shares) => {
    const index = findShareIndex(shares, ref);
    if (index < 0) {
      throw new Error(`Share not found: ${ref}`);
    }

    const revoked: PotShare = {
      ...shares[index],
      status: "revoked",
      revoked_at: Date.now(),
    };
    const next = [...shares];
    next[index] = revoked;

    return {
      next,
      result: normalizeShare(revoked),
    };
  });
}

export async function resolveShare(ref: string, opts: ShareOptions): Promise<ResolvedShare | null> {
  const share = await getShare(ref, opts);
  if (!share) {
    return null;
  }

  if (share.status !== "active") {
    return null;
  }

  const pot = await requirePot(share.pot_slug, opts);
  const files = await listPotFiles(pot.slug, opts);

  return {
    share,
    pot,
    files,
  };
}

export async function getPublicShare(token: string, opts: ShareOptions): Promise<PotShare | null> {
  const shares = await readWorkspaceJson(opts.wsPath, SHARES_FILE, [] as PotShare[]);
  return findPublicShareByToken(shares, token);
}

export async function resolvePublicShare(token: string, opts: ShareOptions): Promise<ResolvedPublicShare | null> {
  const share = await getPublicShare(token, opts);
  if (!share || share.status !== "active") {
    return null;
  }

  const pot = await requirePot(share.pot_slug, opts);
  const items = await ensureShareItems(share, opts);

  return {
    share,
    pot,
    items,
  };
}

export async function resolvePublicShareItem(
  token: string,
  shareItemId: string,
  opts: ShareOptions,
): Promise<ResolvedPublicShareItem | null> {
  const resolved = await resolvePublicShare(token, opts);
  if (!resolved) {
    return null;
  }

  const item = resolved.items.find((candidate) => candidate.id === shareItemId);
  if (!item) {
    return null;
  }

  const file = await getFileInfo(item.file_id, opts);
  if (!file) {
    return null;
  }

  return {
    share: resolved.share,
    pot: resolved.pot,
    item,
    file,
  };
}