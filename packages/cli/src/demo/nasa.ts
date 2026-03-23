import { createWriteStream } from "node:fs";
import { access, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { store, type EmbeddingProvider } from "@clawdrive/core";

const NASA_DEMO_NAME = "nasa";
const NASA_DEMO_WORKSPACE = "nasa-demo";
const NASA_CACHE_DIR = join("context", "demo-datasets", "nasa");
const NASA_MANIFEST_PATH = join("sample-files", "sources.json");
const NASA_SAMPLE_DIR = "sample-files";
const NASA_SEED_MARKER = join(".demo-seeds", "nasa.json");

interface NasaManifestEntry {
  kind: string;
  theme: string;
  title: string;
  fileName: string;
  bytes: number;
  nasaId: string | null;
  query: string | null;
  sourceUrl: string | null;
  downloadUrl: string | null;
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

export function resolveWorkspaceForDemo(
  requestedWorkspace: string,
  demo: string | undefined,
  workspaceSource?: string,
): string {
  if (demo !== NASA_DEMO_NAME) {
    return requestedWorkspace;
  }

  if (requestedWorkspace === "default" && workspaceSource !== "cli") {
    return NASA_DEMO_WORKSPACE;
  }

  return requestedWorkspace;
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
    const remoteUrl = getRemoteUrl(entry);
    if (!remoteUrl) {
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
    await downloadFile(remoteUrl, destination, entry.bytes);
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
  const markerPath = join(ctx.wsPath, NASA_SEED_MARKER);
  const marker = await readJsonFileOrNull<NasaSeedMarker>(markerPath);
  if (
    marker &&
    marker.datasetId === datasetId &&
    marker.fileCount === manifest.entries.length &&
    marker.totalBytes === manifest.totalBytes
  ) {
    console.log(`[demo:${NASA_DEMO_NAME}] workspace already seeded`);
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
        tags: buildTags(entry),
        description: buildDescription(entry),
        sourceUrl: entry.sourceUrl ?? entry.downloadUrl ?? undefined,
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

async function resolveEntryPath(
  entry: NasaManifestEntry,
  sampleDir: string,
  cacheDir: string,
): Promise<string> {
  const sourcePath = getRemoteUrl(entry)
    ? join(cacheDir, entry.fileName)
    : join(sampleDir, entry.fileName);

  if (!(await pathExists(sourcePath))) {
    throw new Error(`Missing demo asset: ${sourcePath}`);
  }

  return sourcePath;
}

function getRemoteUrl(entry: NasaManifestEntry): string | null {
  return entry.downloadUrl ?? entry.sourceUrl;
}

function buildTags(entry: NasaManifestEntry): string[] {
  return [...new Set(["demo", "nasa", entry.theme, entry.kind].filter(Boolean))];
}

function buildDescription(entry: NasaManifestEntry): string {
  const fragments = [entry.title];
  if (entry.query) {
    fragments.push(`NASA query: ${entry.query}`);
  }
  if (entry.nasaId) {
    fragments.push(`NASA ID: ${entry.nasaId}`);
  }
  return fragments.join(". ");
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
