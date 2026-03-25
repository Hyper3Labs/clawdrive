import { readWorkspaceJson, updateWorkspaceJson } from "./metadata.js";

const DIGESTS_FILE = "digests.json";

export interface DigestOptions {
  wsPath: string;
}

export function normalizeDigest(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  const normalized = value
    .trim()
    .replace(/\r\n/g, "\n");

  return normalized.length > 0 ? normalized : null;
}

export async function getDigest(fileId: string, opts: DigestOptions): Promise<string | null> {
  const digests = await readWorkspaceJson(opts.wsPath, DIGESTS_FILE, {} as Record<string, string>);
  return normalizeDigest(digests[fileId]);
}

export async function listDigests(opts: DigestOptions): Promise<Record<string, string>> {
  const digests = await readWorkspaceJson(opts.wsPath, DIGESTS_FILE, {} as Record<string, string>);
  const normalized = Object.entries(digests)
    .map(([fileId, digest]) => [fileId, normalizeDigest(digest)] as const)
    .filter((entry): entry is readonly [string, string] => entry[1] != null);

  return Object.fromEntries(normalized);
}

export async function setDigest(
  fileId: string,
  digest: string | null | undefined,
  opts: DigestOptions,
): Promise<void> {
  const nextDigest = normalizeDigest(digest);

  await updateWorkspaceJson(opts.wsPath, DIGESTS_FILE, {} as Record<string, string>, (current) => {
    const next = { ...current };

    if (nextDigest == null) {
      delete next[fileId];
    } else {
      next[fileId] = nextDigest;
    }

    return {
      next,
      result: undefined,
    };
  });
}