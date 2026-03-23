import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Command } from "commander";
import { buildPotTag, createPot, dedupeTags, getFileInfo, requirePot, store, update } from "@clawdrive/core";
import { formatJson } from "../formatters/json.js";
import { getGlobalOptions, setupContext, setupWorkspaceContext } from "../helpers.js";

interface CollectedSource {
  source: string;
  path: string;
  sourceUrl?: string;
  cleanup?: () => Promise<void>;
}

interface PotAddResult {
  source: string;
  status: "stored" | "attached" | "existing" | "error";
  id?: string;
  chunks?: number;
  error?: string;
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

async function collectSource(source: string): Promise<CollectedSource[]> {
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

function summarizeResults(results: PotAddResult[]): { stored: number; attached: number; existing: number; failed: number } {
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

export function registerPotCommand(program: Command) {
  const pot = program
    .command("pot")
    .description("Create pots and add files, folders, or links to them");

  pot
    .command("create <name>")
    .description("Create a shared pot")
    .option("--desc <description>", "Pot description")
    .action(async (name: string, cmdOpts, cmd) => {
      const globalOpts = getGlobalOptions(cmd);
      const ctx = await setupWorkspaceContext(globalOpts);

      try {
        const created = await createPot(
          {
            name,
            description: cmdOpts.desc,
          },
          { wsPath: ctx.wsPath },
        );

        if (globalOpts.json) {
          console.log(formatJson(created));
        } else {
          console.log(`Created pot ${created.slug}`);
        }
      } catch (err) {
        console.error(`Error creating pot: ${(err as Error).message}`);
        process.exit(1);
      }
    });

  pot
    .command("add <pot> <sources...>")
    .description("Add local files, folders, or links to a pot")
    .action(async (potRef: string, sources: string[], _cmdOpts, cmd) => {
      const globalOpts = getGlobalOptions(cmd);
      const ctx = await setupContext(globalOpts);

      try {
        const potRecord = await requirePot(potRef, { wsPath: ctx.wsPath });
        const potTag = buildPotTag(potRecord.slug);
        const collected = (await Promise.all(sources.map((source) => collectSource(source)))).flat();
        const results: PotAddResult[] = [];

        for (const source of collected) {
          try {
            const result = await store(
              {
                sourcePath: source.path,
                tags: [potTag],
                sourceUrl: source.sourceUrl,
              },
              { wsPath: ctx.wsPath, embedder: ctx.embedder },
            );

            if (result.status === "duplicate") {
              const existingId = result.duplicateId ?? result.id;
              const existing = await getFileInfo(existingId, { wsPath: ctx.wsPath });
              if (!existing) {
                throw new Error(`Duplicate file vanished: ${existingId}`);
              }

              if (existing.tags.includes(potTag)) {
                results.push({ source: source.source, status: "existing", id: existing.id });
              } else {
                await update(
                  existing.id,
                  { tags: dedupeTags([...existing.tags, potTag]) },
                  { wsPath: ctx.wsPath },
                );
                results.push({ source: source.source, status: "attached", id: existing.id });
              }
            } else {
              results.push({
                source: source.source,
                status: "stored",
                id: result.id,
                chunks: result.chunks,
              });
            }
          } catch (err) {
            results.push({
              source: source.source,
              status: "error",
              error: (err as Error).message,
            });
          } finally {
            await source.cleanup?.();
          }
        }

        const summary = summarizeResults(results);

        if (globalOpts.json) {
          console.log(formatJson({
            pot: potRecord.slug,
            total: results.length,
            ...summary,
            results,
          }));
        } else {
          console.log(`Pot ${potRecord.slug}: ${summary.stored} stored, ${summary.attached} attached, ${summary.existing} already present, ${summary.failed} failed`);
          for (const result of results) {
            if (result.status === "error") {
              console.log(`- ${result.status} ${result.source}: ${result.error}`);
            } else {
              console.log(`- ${result.status} ${result.source} -> ${result.id}`);
            }
          }
        }

        if (summary.failed > 0) {
          process.exitCode = 1;
        }
      } catch (err) {
        console.error(`Error adding to pot: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}