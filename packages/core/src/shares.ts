import { randomBytes } from "node:crypto";
import { uuidv7 } from "uuidv7";
import type { PotShare, ResolvedShare, ShareKind, ShareRole } from "./types.js";
import { readWorkspaceJson, updateWorkspaceJson } from "./metadata.js";
import { listPotFiles, requirePot } from "./pots.js";

const SHARES_FILE = "shares.json";

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
  if (input.kind === "principal" && !input.principal?.trim()) {
    throw new Error("Principal is required for direct shares");
  }
  if (input.expiresAt != null && input.expiresAt <= Date.now()) {
    throw new Error("Share expiry must be in the future");
  }

  return updateWorkspaceJson(opts.wsPath, SHARES_FILE, [] as PotShare[], (shares) => {
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

    return {
      next: [...shares, share],
      result: normalizeShare(share),
    };
  });
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