import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { acquireLock } from "./lock.js";

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