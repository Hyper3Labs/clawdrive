import { createWriteStream } from "node:fs";
import { access, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  acquireLock,
  createDatabase,
  getFilesTable,
  store,
  toFileRecord,
  update,
  type EmbeddingProvider,
} from "@clawdrive/core";

const NASA_DEMO_NAME = "nasa";
export const NASA_DEMO_WORKSPACE = "nasa-demo";
const NASA_CACHE_DIR = join("context", "demo-datasets", "nasa");
const NASA_MANIFEST_PATH = join("sample-files", "sources.json");
const NASA_SAMPLE_DIR = "sample-files";
const NASA_SEED_MARKER = join(".demo-seeds", "nasa.json");
const LEGACY_NASA_NOTE_FILES = new Set([
  "apollo-note.md",
  "artemis-note.md",
  "earth-note.md",
  "hubble-note.md",
  "mars-note.md",
  "webb-note.md",
]);
const LEGACY_NASA_TAGS = new Set([
  "demo",
  "nasa",
  "image",
  "video",
  "audio",
  "pdf",
  "note",
  "apollo",
  "artemis",
  "earth",
  "hubble",
  "mars",
  "webb",
]);
const LEGACY_NASA_WORKSPACE_METADATA_FILES = new Set([
  "README.md",
  "sources.json",
]);

interface NasaManifestEntry {
  fileName: string;
  bytes: number;
  sourceUrl: string | null;
}

interface NasaManifest {
  datasetId?: string;
  totalBytes: number;
  totalMegabytes: number;
  entries: NasaManifestEntry[];
}

interface NasaSeedMarker {
  datasetId: string;
  fileCount: number;
  totalBytes: number;
  seededAt: string;
}

interface DemoContext {
  wsPath: string;
  embedder: EmbeddingProvider;
}

export async function prepareDemoWorkspace(
  demo: string | undefined,
  ctx: DemoContext,
): Promise<void> {
  if (!demo) {
    return;
  }

  if (demo !== NASA_DEMO_NAME) {
    throw new Error(`Unsupported demo dataset: ${demo}`);
  }

  const repoRoot = await findRepoRoot(process.cwd());
  const sampleDir = join(repoRoot, NASA_SAMPLE_DIR);
  const cacheDir = join(repoRoot, NASA_CACHE_DIR);
  const manifest = await readJsonFile<NasaManifest>(join(repoRoot, NASA_MANIFEST_PATH));
  const datasetId = manifest.datasetId ?? "nasa-demo-v1";

  console.log(
    `[demo:${NASA_DEMO_NAME}] preparing ${manifest.totalMegabytes} MB NASA bundle`,
  );
  await ensureDownloads(manifest, sampleDir, cacheDir);
  await ensureSeeded(datasetId, manifest, sampleDir, cacheDir, ctx);
}

async function ensureDownloads(
  manifest: NasaManifest,
  sampleDir: string,
  cacheDir: string,
): Promise<void> {
  let downloaded = 0;

  for (const entry of manifest.entries) {
    if (!entry.sourceUrl) {
      const localPath = join(sampleDir, entry.fileName);
      if (!(await pathExists(localPath))) {
        throw new Error(`Missing local demo file: ${localPath}`);
      }
      continue;
    }

    const destination = join(cacheDir, entry.fileName);
    const existingSize = await getFileSize(destination);
    if (existingSize === entry.bytes) {
      continue;
    }

    await mkdir(dirname(destination), { recursive: true });
    console.log(
      `[demo:${NASA_DEMO_NAME}] downloading ${entry.fileName} (${formatMegabytes(entry.bytes)})`,
    );
    await downloadFile(entry.sourceUrl, destination, entry.bytes);
    downloaded += 1;
  }

  if (downloaded === 0) {
    console.log(`[demo:${NASA_DEMO_NAME}] dataset cache already up to date`);
    return;
  }

  console.log(`[demo:${NASA_DEMO_NAME}] downloaded ${downloaded} file(s)`);
}

async function ensureSeeded(
  datasetId: string,
  manifest: NasaManifest,
  sampleDir: string,
  cacheDir: string,
  ctx: DemoContext,
): Promise<void> {
  await cleanupLegacySeedData(manifest, ctx);

  const markerPath = join(ctx.wsPath, NASA_SEED_MARKER);
  const marker = await readJsonFileOrNull<NasaSeedMarker>(markerPath);
  if (
    marker &&
    marker.datasetId === datasetId &&
    marker.fileCount === manifest.entries.length &&
    marker.totalBytes === manifest.totalBytes
  ) {
    console.log(`[demo:${NASA_DEMO_NAME}] demo dataset already seeded`);
    return;
  }

  let stored = 0;
  let duplicates = 0;

  for (const [index, entry] of manifest.entries.entries()) {
    const sourcePath = await resolveEntryPath(entry, sampleDir, cacheDir);
    console.log(
      `[demo:${NASA_DEMO_NAME}] ingesting ${index + 1}/${manifest.entries.length}: ${entry.fileName}`,
    );

    const result = await store(
      {
        sourcePath,
        sourceUrl: entry.sourceUrl ?? undefined,
      },
      { wsPath: ctx.wsPath, embedder: ctx.embedder },
    );

    if (result.status === "duplicate") {
      duplicates += 1;
    } else {
      stored += 1;
    }
  }

  await mkdir(dirname(markerPath), { recursive: true });
  await writeFile(
    markerPath,
    `${JSON.stringify(
      {
        datasetId,
        fileCount: manifest.entries.length,
        totalBytes: manifest.totalBytes,
        seededAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(
    `[demo:${NASA_DEMO_NAME}] seed complete: ${stored} stored, ${duplicates} duplicates`,
  );
}

async function cleanupLegacySeedData(
  manifest: NasaManifest,
  ctx: DemoContext,
): Promise<void> {
  const db = await createDatabase(join(ctx.wsPath, "db"));
  const table = await getFilesTable(db, ctx.wsPath);
  const rows = await table
    .query()
    .where("deleted_at IS NULL AND parent_id IS NULL")
    .limit(1_000_000)
    .toArray();

  const files = rows.map((row) => toFileRecord(row as Record<string, unknown>));
  const manifestNames = new Set(manifest.entries.map((entry) => entry.fileName));
  const legacyWorkspaceMetadata = ctx.wsPath.endsWith(join("workspaces", NASA_DEMO_WORKSPACE))
    ? LEGACY_NASA_WORKSPACE_METADATA_FILES
    : new Set<string>();
  const filesToPurge = new Set([
    ...LEGACY_NASA_NOTE_FILES,
    ...legacyWorkspaceMetadata,
  ]);

  const purgeFiles = files.filter((file) => filesToPurge.has(file.original_name));
  if (purgeFiles.length > 0) {
    const release = await acquireLock(ctx.wsPath);
    try {
      const lockedDb = await createDatabase(join(ctx.wsPath, "db"));
      const lockedTable = await getFilesTable(lockedDb, ctx.wsPath);
      for (const file of purgeFiles) {
        await rm(join(ctx.wsPath, "files", file.file_path), { force: true });
        await lockedTable.delete(`id = '${file.id}' OR parent_id = '${file.id}'`);
      }
    } finally {
      await release();
    }
  }

  const managedFiles = files.filter((file) => manifestNames.has(file.original_name));
  for (const file of managedFiles) {
    const nextTags = file.tags.filter((tag) => !LEGACY_NASA_TAGS.has(tag));
    const shouldClearDescription = file.description !== null;
    const shouldUpdateTags = nextTags.length !== file.tags.length;

    if (!shouldClearDescription && !shouldUpdateTags) {
      continue;
    }

    await update(
      file.id,
      {
        description: null,
        ...(shouldUpdateTags ? { tags: nextTags } : {}),
      },
      { wsPath: ctx.wsPath },
    );
  }
}

async function resolveEntryPath(
  entry: NasaManifestEntry,
  sampleDir: string,
  cacheDir: string,
): Promise<string> {
  const sourcePath = entry.sourceUrl
    ? join(cacheDir, entry.fileName)
    : join(sampleDir, entry.fileName);

  if (!(await pathExists(sourcePath))) {
    throw new Error(`Missing demo asset: ${sourcePath}`);
  }

  return sourcePath;
}

async function findRepoRoot(startDir: string): Promise<string> {
  let currentDir = resolve(startDir);

  while (true) {
    const manifestPath = join(currentDir, NASA_MANIFEST_PATH);
    if (await pathExists(manifestPath)) {
      return currentDir;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error(
        "The NASA demo bundle is only available from the repository checkout.",
      );
    }

    currentDir = parentDir;
  }
}

async function downloadFile(
  url: string,
  destination: string,
  expectedBytes: number,
): Promise<void> {
  const tempPath = `${destination}.part`;
  const response = await fetch(url, {
    headers: {
      "user-agent": "clawdrive-demo-nasa/1.0",
    },
  });

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }

  try {
    const body = Readable.fromWeb(response.body as any);
    await pipeline(body, createWriteStream(tempPath));

    const finalSize = await getFileSize(tempPath);
    if (finalSize !== expectedBytes) {
      throw new Error(
        `Downloaded ${destination} with ${finalSize ?? 0} bytes, expected ${expectedBytes}`,
      );
    }

    await rename(tempPath, destination);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

async function readJsonFileOrNull<T>(filePath: string): Promise<T | null> {
  if (!(await pathExists(filePath))) {
    return null;
  }

  return readJsonFile<T>(filePath);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getFileSize(filePath: string): Promise<number | null> {
  try {
    const fileStat = await stat(filePath);
    return fileStat.size;
  } catch {
    return null;
  }
}

function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
