import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface CollectedSource {
  source: string;
  path: string;
  sourceUrl?: string;
  cleanup?: () => Promise<void>;
}

async function walkDir(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkDir(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function buildUrlStubName(url: URL): string {
  const raw = [url.hostname, ...url.pathname.split("/").filter(Boolean).slice(-2)]
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${raw || "link"}.url.md`;
}

async function createUrlStub(source: string): Promise<CollectedSource> {
  const url = new URL(source);
  const dir = await mkdtemp(join(tmpdir(), "cdrive-link-"));
  const filePath = join(dir, buildUrlStubName(url));
  const content = [
    "Link",
    "",
    `URL: ${source}`,
    `Host: ${url.hostname}`,
    `Path: ${url.pathname || "/"}`,
  ].join("\n");

  await writeFile(filePath, content, "utf-8");

  return {
    source,
    path: filePath,
    sourceUrl: source,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

export async function collectSource(source: string): Promise<CollectedSource[]> {
  if (isHttpUrl(source)) {
    return [await createUrlStub(source)];
  }

  const sourceStat = await stat(source);
  if (sourceStat.isDirectory()) {
    return (await walkDir(source)).map((path) => ({ source: path, path }));
  }

  if (sourceStat.isFile()) {
    return [{ source, path: source }];
  }

  throw new Error(`Unsupported source: ${source}`);
}

export async function collectSources(sources: string[]): Promise<CollectedSource[]> {
  return (await Promise.all(sources.map((source) => collectSource(source)))).flat();
}