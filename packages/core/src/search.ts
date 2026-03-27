// packages/core/src/search.ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { chunkAudio } from "./chunker/audio.js";
import { detectMimeType } from "./chunker/detect.js";
import { chunkPdf } from "./chunker/pdf.js";
import type { Chunk } from "./chunker/types.js";
import { chunkVideo } from "./chunker/video.js";
import { prepareBinaryForEmbedding, prepareImageFileForEmbedding, isEmbeddableMediaType } from "./embedding/media.js";
import type { EmbeddingProvider } from "./embedding/types.js";
import { buildPotTag, slugifyPotName } from "./metadata.js";
import { createDatabase, getFilesTable } from "./storage/db.js";
import type { SearchInput, SearchResult } from "./types.js";

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
 * Validate that a MIME type filter is safe to interpolate into a WHERE clause.
 * Accepts either a prefix like "image/" or a full MIME type like "application/pdf".
 * Only allows alphanumeric chars, hyphens, dots, plus signs, and forward slashes.
 */
function isValidMimeFilter(value: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*\/[a-zA-Z0-9!#$&\-^_.+*]*$/.test(value);
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
  const table = await getFilesTable(db, wsPath);

  // 2. Build WHERE filters (applied to all modes)
  const filters: string[] = [
    "deleted_at IS NULL",
    "status = 'embedded'",
    `embedding_model = '${embedder.modelId}'`,
  ];
  if (input.contentType) {
    const types = Array.isArray(input.contentType)
      ? input.contentType
      : [input.contentType];
    const clauses = types
      .filter((t) => isValidMimeFilter(t))
      .map((t) => {
        if (t.endsWith("/")) {
          const escaped = t.replace(/_/g, "\\_");
          return `content_type LIKE '${escaped}%'`;
        }
        return `content_type = '${t}'`;
      },
      );
    if (clauses.length === 1) {
      filters.push(clauses[0]);
    } else if (clauses.length > 1) {
      filters.push(`(${clauses.join(" OR ")})`);
    }
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
  const queryVector = await buildQueryVector(input, embedder);

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

async function buildQueryVector(
  input: SearchInput,
  embedder: EmbeddingProvider,
): Promise<Float32Array> {
  const queryText = input.query?.trim();

  if (input.queryFile && input.queryImage && input.queryFile !== input.queryImage) {
    throw new Error("Search accepts either queryFile or queryImage, not two different query files");
  }

  const queryMediaPath = input.queryFile ?? input.queryImage;
  if (!queryText && !queryMediaPath) {
    throw new Error("Search requires query text, a query image, a query file, or a combination of text plus media");
  }

  if (!queryMediaPath) {
    return embedder.embed({
      parts: [{ kind: "text", text: queryText! }],
      taskType: "RETRIEVAL_QUERY",
    });
  }

  const mimeType = detectMimeType(queryMediaPath);
  if (input.queryImage && !input.queryFile && !mimeType.startsWith("image/")) {
    throw new Error(`Query image must be an image file, got ${mimeType}`);
  }
  if (!isEmbeddableMediaType(mimeType)) {
    throw new Error(`Query file must be an image, PDF, audio, or video file, got ${mimeType}`);
  }

  const chunks = await buildQueryChunks(queryMediaPath, mimeType);
  const vectors: Float32Array[] = [];
  for (const chunk of chunks) {
    vectors.push(
      await embedder.embed({
        parts: buildQueryParts(queryText, chunk),
        taskType: "RETRIEVAL_QUERY",
      }),
    );
  }

  return averageEmbeddings(vectors, embedder.dimensions);
}

async function buildQueryChunks(filePath: string, mimeType: string): Promise<Chunk[]> {
  if (mimeType === "application/pdf") {
    return chunkPdf(filePath);
  }

  if (mimeType.startsWith("audio/")) {
    return prepareBinaryQueryChunks(await chunkAudio(filePath));
  }

  if (mimeType.startsWith("video/")) {
    return prepareBinaryQueryChunks(await chunkVideo(filePath));
  }

  if (mimeType.startsWith("image/")) {
    const prepared = await prepareImageFileForEmbedding(filePath, mimeType);
    return [{ index: 0, label: "full", data: prepared.data, mimeType: prepared.mimeType }];
  }

  const prepared = await prepareBinaryForEmbedding(await readFile(filePath), mimeType);
  return [{ index: 0, label: "full", data: prepared.data, mimeType: prepared.mimeType }];
}

async function prepareBinaryQueryChunks(chunks: Chunk[]): Promise<Chunk[]> {
  return Promise.all(
    chunks.map(async (chunk) => {
      if (!chunk.data || !chunk.mimeType) {
        return chunk;
      }

      const prepared = await prepareBinaryForEmbedding(chunk.data, chunk.mimeType);
      return {
        ...chunk,
        data: prepared.data,
        mimeType: prepared.mimeType,
      };
    }),
  );
}

function buildQueryParts(
  queryText: string | undefined,
  chunk: Pick<Chunk, "data" | "mimeType" | "label">,
): Array<{ kind: "text"; text: string } | { kind: "inline-data"; data: Buffer; mimeType: string }> {
  const parts: Array<{ kind: "text"; text: string } | { kind: "inline-data"; data: Buffer; mimeType: string }> = [];

  if (queryText) {
    parts.push({ kind: "text", text: queryText });
  }

  if (chunk.data && chunk.mimeType) {
    parts.push({ kind: "inline-data", data: chunk.data, mimeType: chunk.mimeType });
  }

  if (parts.length === 0) {
    throw new Error(`Query chunk ${chunk.label} does not contain embeddable content`);
  }

  return parts;
}

function averageEmbeddings(vectors: Float32Array[], dimensions: number): Float32Array {
  if (vectors.length === 0) {
    return new Float32Array(dimensions);
  }

  const averaged = new Float32Array(dimensions);
  for (const vector of vectors) {
    for (let i = 0; i < dimensions; i++) {
      averaged[i] += vector[i];
    }
  }

  for (let i = 0; i < dimensions; i++) {
    averaged[i] /= vectors.length;
  }

  let norm = 0;
  for (let i = 0; i < dimensions; i++) {
    norm += averaged[i] * averaged[i];
  }

  if (norm === 0) {
    return averaged;
  }

  const scale = 1 / Math.sqrt(norm);
  for (let i = 0; i < dimensions; i++) {
    averaged[i] *= scale;
  }

  return averaged;
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
    const parentId = row.parent_id as string | null;
    if (!parentId) {
      continue;
    }

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
    const fileId = (parentId ?? row.id) as string;

    return {
      id: fileId,
      score: row._score as number,
      file: (row.display_name as string | null) ?? (row.original_name as string),
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
