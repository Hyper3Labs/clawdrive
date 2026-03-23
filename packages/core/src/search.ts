// packages/core/src/search.ts
import type { SearchInput, SearchResult } from "./types.js";
import type { EmbeddingProvider } from "./embedding/types.js";
import { createDatabase, getFilesTable } from "./storage/db.js";
import { join } from "node:path";
import { Index } from "@lancedb/lancedb";
import { buildPotTag, slugifyPotName } from "./metadata.js";

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
 * Attempt to create an FTS index on the searchable_text column if one doesn't exist.
 * Silently ignores errors (e.g., if table is empty or FTS is unsupported).
 */
async function ensureFtsIndex(table: import("@lancedb/lancedb").Table): Promise<boolean> {
  try {
    const indices = await table.listIndices();
    const hasFts = indices.some(
      (idx) => idx.columns.includes("searchable_text") && idx.indexType === "FTS",
    );
    if (!hasFts) {
      await table.createIndex("searchable_text", {
        config: Index.fts({ withPosition: false }),
      });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Search the workspace for files matching the query.
 *
 * Supports three modes:
 * - "vector" (default): semantic vector similarity search
 * - "fts": full-text search on searchable_text
 * - "hybrid": combines vector + FTS via reciprocal rank fusion
 */
export async function search(
  input: SearchInput,
  opts: SearchOptions,
): Promise<SearchResult[]> {
  const { wsPath, embedder } = opts;
  const dbPath = join(wsPath, "db");
  const mode = input.mode ?? "vector";
  const limit = input.limit ?? 10;
  const fetchLimit = input.pot ? 1_000_000 : Math.max(limit * 3, 50);

  // 1. Open DB and get table
  const db = await createDatabase(dbPath);
  const table = await getFilesTable(db);

  // 2. Build WHERE filters (applied to all modes)
  const filters: string[] = [
    "deleted_at IS NULL",
    "status = 'embedded'",
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

  // 3. Run search based on mode
  let rawResults: Array<Record<string, unknown>>;

  if (mode === "fts") {
    rawResults = await runFtsSearch(table, input.query, whereClause, fetchLimit);
  } else if (mode === "hybrid") {
    rawResults = await runHybridSearch(table, input.query, embedder, whereClause, fetchLimit);
  } else {
    rawResults = await runVectorSearch(table, input.query, embedder, whereClause, fetchLimit);
  }

  // 4. Post-process: deduplicate by parent, filter tags, convert to SearchResult
  return postProcess(rawResults, input, limit);
}

/**
 * Run a vector similarity search.
 */
async function runVectorSearch(
  table: import("@lancedb/lancedb").Table,
  query: string,
  embedder: EmbeddingProvider,
  whereClause: string,
  fetchLimit: number,
): Promise<Array<Record<string, unknown>>> {
  // Embed the query
  const queryVector = await embedder.embed({
    kind: "text",
    text: query,
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
 * Run a full-text search on searchable_text.
 */
async function runFtsSearch(
  table: import("@lancedb/lancedb").Table,
  query: string,
  whereClause: string,
  fetchLimit: number,
): Promise<Array<Record<string, unknown>>> {
  const hasFts = await ensureFtsIndex(table);
  if (!hasFts) {
    return [];
  }

  try {
    const results = await table
      .search(query, "fts")
      .where(whereClause)
      .limit(fetchLimit)
      .toArray();

    return results.map((r, i) => {
      // Spread into a plain object to avoid proxy issues
      const row: Record<string, unknown> = { ...(r as Record<string, unknown>) };
      // FTS results may have a _score or _relevance_score field
      // Use rank-based scoring as fallback
      const ftsScore = (row._score as number) ?? (row._relevance_score as number);
      row._score = ftsScore ?? 1 / (1 + i);
      return row;
    });
  } catch {
    return [];
  }
}

/**
 * Run hybrid search: combine vector + FTS via reciprocal rank fusion.
 */
async function runHybridSearch(
  table: import("@lancedb/lancedb").Table,
  query: string,
  embedder: EmbeddingProvider,
  whereClause: string,
  fetchLimit: number,
): Promise<Array<Record<string, unknown>>> {
  const [vectorResults, ftsResults] = await Promise.all([
    runVectorSearch(table, query, embedder, whereClause, fetchLimit),
    runFtsSearch(table, query, whereClause, fetchLimit),
  ]);

  // Reciprocal rank fusion
  const k = 60; // RRF constant
  const scoreMap = new Map<string, { row: Record<string, unknown>; score: number }>();

  vectorResults.forEach((row, rank) => {
    const id = row.id as string;
    const existing = scoreMap.get(id);
    const rrfScore = 1 / (k + rank + 1);
    if (existing) {
      existing.score += rrfScore;
    } else {
      scoreMap.set(id, { row, score: rrfScore });
    }
  });

  ftsResults.forEach((row, rank) => {
    const id = row.id as string;
    const existing = scoreMap.get(id);
    const rrfScore = 1 / (k + rank + 1);
    if (existing) {
      existing.score += rrfScore;
    } else {
      scoreMap.set(id, { row, score: rrfScore });
    }
  });

  // Sort by combined RRF score descending
  const merged = Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score);

  return merged.map(({ row, score }) => {
    row._score = score;
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
      description: (row.description as string | null) ?? null,
    };
  });
}
