import { join } from "node:path";
import { uuidv7 } from "uuidv7";
import type { FileRecord, PotRecord } from "./types.js";
import { createDatabase, getFilesTable, toFileRecord } from "./storage/db.js";
import { buildPotTag, readWorkspaceJson, slugifyPotName, updateWorkspaceJson } from "./metadata.js";

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

export async function listPotFiles(ref: string, opts: PotOptions): Promise<FileRecord[]> {
  const pot = await requirePot(ref, opts);
  const potTag = buildPotTag(pot.slug);
  const db = await createDatabase(join(opts.wsPath, "db"));
  const table = await getFilesTable(db);

  const rows = await table
    .query()
    .where("deleted_at IS NULL AND parent_id IS NULL")
    .limit(1_000_000)
    .toArray();

  return rows
    .map((row) => toFileRecord(row as Record<string, unknown>))
    .filter((file) => file.tags.includes(potTag))
    .sort((left, right) => right.created_at - left.created_at);
}