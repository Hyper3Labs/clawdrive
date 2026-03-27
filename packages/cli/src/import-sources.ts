import { store } from "@clawdrive/core";
import {
  importSourceToPot,
  type PotImportContext,
  type PotImportResult,
  type PotImportSource,
} from "./pot-import.js";
import { collectSources } from "./source-collection.js";

async function importSourceToWorkspace(
  source: PotImportSource,
  opts: PotImportContext,
): Promise<PotImportResult> {
  const result = await store(
    {
      sourcePath: source.path,
      sourceUrl: source.sourceUrl,
      ...(source.tldr != null ? { tldr: source.tldr } : {}),
      ...(source.digest != null ? { digest: source.digest } : {}),
    },
    opts,
  );

  if (result.status !== "duplicate") {
    return {
      source: source.source,
      status: "stored",
      id: result.id,
      chunks: result.chunks,
    };
  }

  return {
    source: source.source,
    status: "existing",
    id: result.duplicateId ?? result.id,
  };
}

export interface ImportSourcesOptions {
  tldr?: string;
}

export async function importSources(
  sources: string[],
  opts: PotImportContext,
  potSlug?: string,
  importOpts?: ImportSourcesOptions,
): Promise<PotImportResult[]> {
  const collected = await collectSources(sources);
  const results: PotImportResult[] = [];

  for (const source of collected) {
    try {
      const sourceEntry: PotImportSource = {
        source: source.source,
        path: source.path,
        sourceUrl: source.sourceUrl,
        ...(importOpts?.tldr ? { tldr: importOpts.tldr } : {}),
      };
      const result = potSlug
        ? await importSourceToPot(sourceEntry, potSlug, opts)
        : await importSourceToWorkspace(sourceEntry, opts);
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

  return results;
}