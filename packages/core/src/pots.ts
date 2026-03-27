import { join } from "node:path";
import { uuidv7 } from "uuidv7";
import type { FileRecord, PotRecord } from "./types.js";
import { createDatabase, getFilesTable, toFileRecord } from "./storage/db.js";
import { buildPotTag, readWorkspaceJson, slugifyPotName, updateWorkspaceJson } from "./metadata.js";
import { update } from "./manage.js";

const POTS_FILE = "pots.json";

export interface PotOptions {
  wsPath: string;
}

export interface CreatePotInput {
  name: string;
  description?: string;
}

export async function listPots(opts: PotOptions): Promise<PotRecord[]> {
  const pots = await readWorkspaceJson(opts.wsPath, POTS_FILE, [] as PotRecord[]);
  return [...pots].sort((left, right) => left.name.localeCompare(right.name));
}

export async function getPot(ref: string, opts: PotOptions): Promise<PotRecord | null> {
  const pots = await listPots(opts);
  const slug = slugifyPotName(ref);

  return pots.find((pot) => pot.id === ref || pot.slug === ref || pot.slug === slug || pot.name === ref) ?? null;
}

export async function requirePot(ref: string, opts: PotOptions): Promise<PotRecord> {
  const pot = await getPot(ref, opts);
  if (!pot) {
    throw new Error(`Pot not found: ${ref}`);
  }
  return pot;
}

export async function createPot(input: CreatePotInput, opts: PotOptions): Promise<PotRecord> {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Pot name is required");
  }

  const slug = slugifyPotName(name);
  if (!slug) {
    throw new Error("Pot name must contain letters or numbers");
  }

  return updateWorkspaceJson(opts.wsPath, POTS_FILE, [] as PotRecord[], (pots) => {
    if (pots.some((pot) => pot.slug === slug)) {
      throw new Error(`Pot already exists: ${slug}`);
    }

    const now = Date.now();
    const pot: PotRecord = {
      id: uuidv7(),
      slug,
      name,
      description: input.description?.trim() || null,
      created_at: now,
      updated_at: now,
    };

    return {
      next: [...pots, pot],
      result: pot,
    };
  });
}

export async function renamePot(
  id: string,
  newName: string,
  opts: PotOptions,
): Promise<PotRecord> {
  const name = newName.trim();
  if (!name) throw new Error("Pot name is required");

  const newSlug = slugifyPotName(name);
  if (!newSlug) throw new Error("Pot name must contain letters or numbers");

  let oldSlug: string | null = null;

  const result = await updateWorkspaceJson(opts.wsPath, POTS_FILE, [] as PotRecord[], (pots) => {
    const index = pots.findIndex((p) => p.id === id);
    if (index === -1) throw new Error(`Pot not found: ${id}`);

    oldSlug = pots[index].slug;

    if (pots.some((p) => p.slug === newSlug && p.id !== id)) {
      throw new Error(`Pot already exists: ${newSlug}`);
    }

    const updated: PotRecord = { ...pots[index], name, slug: newSlug, updated_at: Date.now() };
    const next = [...pots];
    next[index] = updated;
    return { next, result: updated };
  });

  // Migrate pot tags on member files
  if (oldSlug && oldSlug !== newSlug) {
    const oldTag = buildPotTag(oldSlug);
    const newTag = buildPotTag(newSlug);
    const db = await createDatabase(join(opts.wsPath, "db"));
    const table = await getFilesTable(db, opts.wsPath);
    const allRows = await table.query().where("deleted_at IS NULL").limit(1_000_000).toArray();
    const rows = allRows.filter((r) => (r as Record<string, unknown>).parent_id === null);
    const members = rows.map((row) => toFileRecord(row as Record<string, unknown>)).filter((file) => file.tags.includes(oldTag));
    for (const file of members) {
      const newTags = file.tags.map((t) => (t === oldTag ? newTag : t));
      await update(file.id, { tags: newTags }, { wsPath: opts.wsPath });
    }
  }

  return result;
}

export async function deletePot(id: string, opts: PotOptions): Promise<void> {
  const pot = await getPot(id, opts);
  if (!pot) throw new Error(`Pot not found: ${id}`);

  // Get file list BEFORE removing the pot from pots.json
  const potTag = buildPotTag(pot.slug);
  const files = await listPotFiles(pot.slug, opts);

  await updateWorkspaceJson(opts.wsPath, POTS_FILE, [] as PotRecord[], (pots) => {
    return { next: pots.filter((p) => p.id !== id), result: undefined };
  });

  for (const file of files) {
    const newTags = file.tags.filter((t) => t !== potTag);
    await update(file.id, { tags: newTags }, { wsPath: opts.wsPath });
  }
}

export async function listPotFiles(ref: string, opts: PotOptions): Promise<FileRecord[]> {
  const pot = await requirePot(ref, opts);
  const potTag = buildPotTag(pot.slug);
  const db = await createDatabase(join(opts.wsPath, "db"));
  const table = await getFilesTable(db, opts.wsPath);

  const allRows = await table
    .query()
    .where("deleted_at IS NULL")
    .limit(1_000_000)
    .toArray();

  return allRows
    .filter((r) => (r as Record<string, unknown>).parent_id === null)
    .map((row) => toFileRecord(row as Record<string, unknown>))
    .filter((file) => file.tags.includes(potTag))
    .sort((left, right) => right.created_at - left.created_at);
}