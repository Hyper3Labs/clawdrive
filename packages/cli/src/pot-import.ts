import type { EmbeddingProvider, PotRecord } from "@clawdrive/core";
import {
  buildPotTag,
  createPot,
  dedupeTags,
  getFileInfo,
  getPot,
  store,
  update,
} from "@clawdrive/core";

export interface PotImportContext {
  wsPath: string;
  embedder: EmbeddingProvider;
}

export interface PotImportSource {
  source: string;
  path: string;
  sourceUrl?: string;
  tldr?: string | null;
  digest?: string | null;
  displayName?: string | null;
}

export interface PotImportResult {
  source: string;
  status: "stored" | "attached" | "existing" | "error";
  id?: string;
  chunks?: number;
  error?: string;
}

export async function ensurePotForImport(
  targetPot: string | undefined,
  defaults: { name: string; description?: string | null },
  opts: { wsPath: string },
): Promise<{ pot: PotRecord; created: boolean }> {
  const ref = targetPot?.trim() || defaults.name.trim();
  if (!ref) {
    throw new Error("Pot name is required");
  }

  const existing = await getPot(ref, opts);
  if (existing) {
    return { pot: existing, created: false };
  }

  const created = await createPot(
    {
      name: ref,
      description: defaults.description ?? undefined,
    },
    opts,
  );

  return { pot: created, created: true };
}

function hasText(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function importSourceToPot(
  source: PotImportSource,
  potSlug: string,
  opts: PotImportContext,
): Promise<PotImportResult> {
  const potTag = buildPotTag(potSlug);
  const result = await store(
    {
      sourcePath: source.path,
      tags: [potTag],
      sourceUrl: source.sourceUrl,
      ...(source.tldr != null ? { tldr: source.tldr } : {}),
      ...(source.digest != null ? { digest: source.digest } : {}),
      ...(source.displayName != null ? { displayName: source.displayName } : {}),
    },
    opts,
  );

  if (result.status !== "duplicate") {
    return {
      source: source.source,
      status: "stored",
      id: result.id,
      chunks: result.chunks,
    };
  }

  const existingId = result.duplicateId ?? result.id;
  const existing = await getFileInfo(existingId, { wsPath: opts.wsPath });
  if (!existing) {
    throw new Error(`Duplicate file vanished: ${existingId}`);
  }

  const needsPotTag = !existing.tags.includes(potTag);
  const needsDisplayName = hasText(source.displayName) && !hasText(existing.display_name);
  const needsTldr = hasText(source.tldr) && !hasText(existing.tldr ?? existing.abstract ?? existing.description);
  const needsDigest = hasText(source.digest) && !hasText(existing.digest);

  if (needsPotTag || needsDisplayName || needsTldr || needsDigest) {
    await update(
      existing.id,
      {
        ...(needsPotTag ? { tags: dedupeTags([...existing.tags, potTag]) } : {}),
        ...(needsDisplayName ? { displayName: source.displayName ?? null } : {}),
        ...(needsTldr ? { tldr: source.tldr ?? null } : {}),
        ...(needsDigest ? { digest: source.digest ?? null } : {}),
      },
      { wsPath: opts.wsPath },
    );
  }

  return {
    source: source.source,
    status: needsPotTag ? "attached" : "existing",
    id: existing.id,
  };
}

export function summarizeImportResults(results: PotImportResult[]): {
  stored: number;
  attached: number;
  existing: number;
  failed: number;
} {
  return results.reduce(
    (summary, result) => {
      if (result.status === "stored") summary.stored += 1;
      if (result.status === "attached") summary.attached += 1;
      if (result.status === "existing") summary.existing += 1;
      if (result.status === "error") summary.failed += 1;
      return summary;
    },
    { stored: 0, attached: 0, existing: 0, failed: 0 },
  );
}