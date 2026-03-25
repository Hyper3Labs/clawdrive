// packages/core/src/search.ts
import { join } from "node:path";
import type { SearchInput, SearchResult } from "./types.js";
import type { EmbeddingProvider } from "./embedding/types.js";
import { createDatabase, getFilesTable } from "./storage/db.js";
import { buildPotTag, slugifyPotName } from "./metadata.js";
import { detectMimeType } from "./chunker/detect.js";
import { prepareImageFileForEmbedding } from "./embedding/media.js";

export interface SearchOptions {
  wsPath: string;
  embedder: EmbeddingProvider;
}

/**
 * Convert LanceDB Arrow list values to plain JS arrays.
 * LanceDB may return Arrow Vector objects for list columns.
 */
function toPlainArray(val: unknown): string[] {
  if (val == null) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === "object" && "toArray" in (val as object)) {
    return Array.from((val as { toArray(): string[] }).toArray());
  }
  return [];
}

/**
 * Search the workspace for files matching the query.
 *
 * Uses vector similarity search only.
 */
export async function search(
  input: SearchInput,
  opts: SearchOptions,
): Promise<SearchResult[]> {
  const { wsPath, embedder } = opts;
  const dbPath = join(wsPath, "db");
  const limit = input.limit ?? 10;
  const initialFetchLimit = input.pot ? 1_000_000 : Math.max(limit * 3, 50);
  const maxFetchLimit = input.pot ? initialFetchLimit : Math.max(limit * 50, 1_000);

  // 1. Open DB and get table
  const db = await createDatabase(dbPath);
  const table = await getFilesTable(db);

  // 2. Build WHERE filters (applied to all modes)
  const filters: string[] = [
    "deleted_at IS NULL",
    "status = 'embedded'",
    `embedding_model = '${embedder.modelId}'`,
  ];
  if (input.contentType) {
    filters.push(`content_type = '${input.contentType}'`);
  }
  if (input.after) {
    filters.push(`created_at >= ${input.after.getTime()}`);
  }
  if (input.before) {
    filters.push(`created_at <= ${input.before.getTime()}`);
  }
  const whereClause = filters.join(" AND ");

  // 3. Run vector similarity search
  let fetchLimit = initialFetchLimit;
  let rawResults = await runVectorSearch(table, input, embedder, whereClause, fetchLimit);
  let processed = postProcess(rawResults, input, limit);

  while (
    !input.pot
    && processed.length < limit
    && rawResults.length === fetchLimit
    && fetchLimit < maxFetchLimit
  ) {
    fetchLimit = Math.min(fetchLimit * 2, maxFetchLimit);
    rawResults = await runVectorSearch(table, input, embedder, whereClause, fetchLimit);
    processed = postProcess(rawResults, input, limit);
  }

  // 4. Post-process: deduplicate by parent, filter tags, convert to SearchResult
  return processed;
}

/**
 * Run a vector similarity search.
 */
async function runVectorSearch(
  table: import("@lancedb/lancedb").Table,
  input: SearchInput,
  embedder: EmbeddingProvider,
  whereClause: string,
  fetchLimit: number,
): Promise<Array<Record<string, unknown>>> {
  const queryText = input.query?.trim();
  const queryParts: Array<{ kind: "text"; text: string } | { kind: "inline-data"; data: Buffer; mimeType: string }> = [];

  if (queryText) {
    queryParts.push({ kind: "text", text: queryText });
  }

  if (input.queryImage) {
    const imageMimeType = detectMimeType(input.queryImage);
    if (!imageMimeType.startsWith("image/")) {
      throw new Error(`Query image must be an image file, got ${imageMimeType}`);
    }
    const prepared = await prepareImageFileForEmbedding(input.queryImage, imageMimeType);
    queryParts.push({
      kind: "inline-data",
      data: prepared.data,
      mimeType: prepared.mimeType,
    });
  }

  if (queryParts.length === 0) {
    throw new Error("Search requires query text, a query image, or both");
  }

  const queryVector = await embedder.embed({
    parts: queryParts,
    taskType: "RETRIEVAL_QUERY",
  });

  const results = await table
    .vectorSearch(Array.from(queryVector))
    .distanceType("cosine")
    .where(whereClause)
    .limit(fetchLimit)
    .toArray();

  return results.map((r) => {
    // Spread into a plain object to avoid proxy issues
    const row: Record<string, unknown> = { ...(r as Record<string, unknown>) };
    // cosine distance: _distance is in [0, 2], similarity = 1 - distance
    const distance = (row._distance as number) ?? 0;
    row._score = 1 - distance;
    return row;
  });
}

/**
 * Post-process raw search results:
 * - Deduplicate by parent_id (keep highest-scoring entry per parent)
 * - Filter by tags
 * - Filter by minScore
 * - Convert to SearchResult[]
 * - Sort by score descending
 * - Apply limit
 */
function postProcess(
  rawResults: Array<Record<string, unknown>>,
  input: SearchInput,
  limit: number,
): SearchResult[] {
  // Count total chunks per parent for the totalChunks field
  const chunkCountByParent = new Map<string, number>();
  for (const row of rawResults) {
    const parentId = (row.parent_id as string | null) ?? (row.id as string);
    chunkCountByParent.set(parentId, (chunkCountByParent.get(parentId) ?? 0) + 1);
  }

  // Deduplicate by parent_id: keep the highest-scoring entry per parent
  const bestByParent = new Map<string, Record<string, unknown>>();
  for (const row of rawResults) {
    const parentId = (row.parent_id as string | null) ?? (row.id as string);
    const existing = bestByParent.get(parentId);
    if (!existing || ((row._score as number) > (existing._score as number))) {
      bestByParent.set(parentId, row);
    }
  }

  let deduplicated = Array.from(bestByParent.values());

  // Filter by tags (JavaScript-side, since LanceDB doesn't support array contains in WHERE)
  if (input.tags && input.tags.length > 0) {
    const requiredTags = new Set(input.tags);
    deduplicated = deduplicated.filter((row) => {
      const rowTags = toPlainArray(row.tags);
      return rowTags.some((t) => requiredTags.has(t));
    });
  }

  if (input.pot) {
    const potTag = buildPotTag(slugifyPotName(input.pot));
    deduplicated = deduplicated.filter((row) => {
      const rowTags = toPlainArray(row.tags);
      return rowTags.includes(potTag);
    });
  }

  // Filter by minScore
  if (input.minScore != null) {
    deduplicated = deduplicated.filter(
      (row) => (row._score as number) >= input.minScore!,
    );
  }

  // Sort by score descending
  deduplicated.sort((a, b) => (b._score as number) - (a._score as number));

  // Apply limit
  deduplicated = deduplicated.slice(0, limit);

  // Convert to SearchResult[]
  return deduplicated.map((row) => {
    const parentId = row.parent_id as string | null;
    const isChunk = parentId != null;
    const matchedChunk = isChunk
      ? {
          index: row.chunk_index as number,
          label: row.chunk_label as string,
        }
      : undefined;

    const resultParentId = parentId ?? (row.id as string);
    const totalChunks = chunkCountByParent.get(resultParentId) ?? 1;

    return {
      id: (parentId ?? row.id) as string,
      score: row._score as number,
      file: row.original_name as string,
      contentType: row.content_type as string,
      fileSize: row.file_size as number,
      tags: toPlainArray(row.tags),
      taxonomyPath: toPlainArray(row.taxonomy_path),
      matchedChunk,
      totalChunks,
      filePath: row.file_path as string,
      tldr: (row.description as string | null) ?? null,
      abstract: (row.description as string | null) ?? null,
      description: (row.description as string | null) ?? null,
    };
  });
}
