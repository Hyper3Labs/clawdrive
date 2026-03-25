import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Command } from "commander";
import { createPot, requirePot } from "@clawdrive/core";
import { formatJson } from "../formatters/json.js";
import { getGlobalOptions, setupContext, setupWorkspaceContext } from "../helpers.js";
import { importSourceToPot, summarizeImportResults, type PotImportResult } from "../pot-import.js";

interface CollectedSource {
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
        const collected = (await Promise.all(sources.map((source) => collectSource(source)))).flat();
        const results: PotImportResult[] = [];

        for (const source of collected) {
          try {
            const result = await importSourceToPot(
              {
                source: source.source,
                path: source.path,
                sourceUrl: source.sourceUrl,
              },
              potRecord.slug,
              { wsPath: ctx.wsPath, embedder: ctx.embedder },
            );
            results.push(result);
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

        const summary = summarizeImportResults(results);

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