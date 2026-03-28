import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { acquireLock } from "./lock.js";

export const TLDR_RECOMMENDED_MIN_WORDS = 20;
export const TLDR_RECOMMENDED_MAX_WORDS = 45;

export function slugifyPotName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function buildPotTag(slug: string): string {
  return `pot:${slug}`;
}

export function extractPotSlugs(tags: string[]): string[] {
  return tags
    .filter((tag) => tag.startsWith("pot:"))
    .map((tag) => tag.slice(4));
}

export function dedupeTags(tags: string[]): string[] {
  return Array.from(new Set(tags.filter(Boolean)));
}

export function normalizeTldr(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  const normalized = value
    .trim()
    .replace(/\s+/g, " ");

  return normalized.length > 0 ? normalized : null;
}

export function normalizeTranscript(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  const normalized = value
    .trim()
    .replace(/\r\n/g, "\n");

  return normalized.length > 0 ? normalized : null;
}

export function normalizeCaption(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  const normalized = value
    .trim()
    .replace(/\s+/g, " ");

  return normalized.length > 0 ? normalized : null;
}

export function countWords(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export const ABSTRACT_RECOMMENDED_MIN_WORDS = TLDR_RECOMMENDED_MIN_WORDS;
export const ABSTRACT_RECOMMENDED_MAX_WORDS = TLDR_RECOMMENDED_MAX_WORDS;
export const normalizeAbstract = normalizeTldr;

export async function readWorkspaceJson<T>(
  wsPath: string,
  fileName: string,
  fallback: T,
): Promise<T> {
  try {
    const raw = await readFile(join(wsPath, fileName), "utf-8");
    if (!raw.trim()) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return fallback;
    }
    throw err;
  }
}

export async function writeWorkspaceJson<T>(
  wsPath: string,
  fileName: string,
  value: T,
): Promise<void> {
  await writeFile(join(wsPath, fileName), `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

export async function updateWorkspaceJson<T, TResult>(
  wsPath: string,
  fileName: string,
  fallback: T,
  updater: (current: T) => { next: T; result: TResult } | Promise<{ next: T; result: TResult }>,
): Promise<TResult> {
  const release = await acquireLock(wsPath);
  try {
    const current = await readWorkspaceJson(wsPath, fileName, fallback);
    const { next, result } = await updater(current);
    await writeWorkspaceJson(wsPath, fileName, next);
    return result;
  } finally {
    await release();
  }
}