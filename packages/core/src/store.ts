import { readFile, stat } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import pLimit from "p-limit";
import { uuidv7 } from "uuidv7";
import { chunkAudio } from "./chunker/audio.js";
import { detectMimeType, selectChunker } from "./chunker/detect.js";
import { chunkPdf } from "./chunker/pdf.js";
import { chunkText } from "./chunker/text.js";
import type { Chunk } from "./chunker/types.js";
import { chunkVideo } from "./chunker/video.js";
import { normalizeDigest } from "./digests.js";
import { ensureUniqueFileName, getFileName, normalizeDisplayName } from "./display-names.js";
import {
  isEmbeddableMediaType,
  prepareBinaryForEmbedding,
  prepareImageFileForEmbedding,
} from "./embedding/media.js";
import type { EmbedInput, EmbeddingProvider } from "./embedding/types.js";
import { acquireLock } from "./lock.js";
import { normalizeTldr } from "./metadata.js";
import { createDatabase, getFilesTable, insertFileRecord, queryFiles } from "./storage/db.js";
import { hashFile, storeFile } from "./storage/files.js";
import { assignToTaxonomy } from "./taxonomy.js";
import type { FileRecord, StoreInput, StoreResult, TaskType } from "./types.js";

export interface StoreOptions {
  wsPath: string;
  embedder: EmbeddingProvider;
}

interface PendingFileRecord {
  id: string;
  originalName: string;
  contentType: string;
  filePath: string;
  fileHash: string;
  fileSize: number;
  tldr: string | null;
  tags: string[];
  sourceUrl: string | null;
  displayName: string | null;
  createdAt: number;
}

interface IndexingResult {
  chunks: number;
  tokensUsed: number;
  indexed: boolean;
  indexError?: string;
}

async function allocateDisplayName(
  table: Awaited<ReturnType<typeof getFilesTable>>,
  desiredName: string,
): Promise<string> {
  const usedNames = (await queryFiles(table))
    .filter((row) => row.parent_id === null)
    .map((row) => getFileName(row));

  return ensureUniqueFileName(desiredName, usedNames);
}

export async function store(input: StoreInput, opts: StoreOptions): Promise<StoreResult> {
  const { wsPath, embedder } = opts;
  const { sourcePath, tags = [], sourceUrl = null } = input;
  const tldr = normalizeTldr(input.tldr ?? input.abstract ?? input.description ?? null);
  const digest = normalizeDigest(input.digest);
  const displayName = normalizeDisplayName(input.displayName);
  const dbPath = join(wsPath, "db");
  const filesDir = join(wsPath, "files");

  const [fileHash, fileStat] = await Promise.all([
    hashFile(sourcePath),
    stat(sourcePath),
  ]);
  const fileSize = fileStat.size;
  const originalName = input.originalName ?? basename(sourcePath);
  const ext = extname(originalName);

  let release = await acquireLock(wsPath);

  try {
    const db = await createDatabase(dbPath);
    const table = await getFilesTable(db, wsPath);
    const existingRows = await queryFiles(table);
    const matchingParents = existingRows
      .filter(
        (row) =>
          row.file_hash === fileHash
          && row.parent_id === null
          && row.embedding_model === embedder.modelId,
      )
      .sort((left, right) => {
        const updatedDiff = right.updated_at - left.updated_at;
        if (updatedDiff !== 0) {
          return updatedDiff;
        }
        const createdDiff = right.created_at - left.created_at;
        if (createdDiff !== 0) {
          return createdDiff;
        }
        return right.id.localeCompare(left.id);
      });

    const duplicate = matchingParents.find(
      (row) => row.status === "embedded" || row.status === "pending",
    );

    if (duplicate) {
      await release();
      return toDuplicateResult(duplicate, fileHash);
    }

    const retryable = matchingParents.find(
      (row) => row.status === "stored" || row.status === "failed",
    );

    if (retryable) {
      await table.update({
        where: `id = '${retryable.id}'`,
        values: {
          status: "pending",
          error_message: null,
          updated_at: Date.now(),
        },
      });

      const pendingTarget: PendingFileRecord = {
        id: retryable.id,
        originalName: retryable.original_name,
        contentType: retryable.content_type,
        filePath: retryable.file_path,
        fileHash,
        fileSize: retryable.file_size,
        tldr: retryable.tldr,
        tags: retryable.tags,
        sourceUrl: retryable.source_url,
        displayName: retryable.display_name,
        createdAt: retryable.created_at,
      };

      await release();
      const indexingResult = await completeIndexing(sourcePath, pendingTarget, opts);
      return {
        id: retryable.id,
        fileHash,
        status: "stored",
        chunks: indexingResult.chunks,
        tokensUsed: indexingResult.tokensUsed,
        indexed: indexingResult.indexed,
        ...(indexingResult.indexError ? { indexError: indexingResult.indexError } : {}),
      };
    }

    const desiredName = displayName ?? originalName;
    const uniqueName = await allocateDisplayName(table, desiredName);
    const storedDisplayName = uniqueName === originalName ? null : uniqueName;

    const id = uuidv7();
    const destPath = await storeFile(sourcePath, filesDir, id, ext);
    const filePath = relative(filesDir, destPath);
    const contentType = detectMimeType(originalName);
    const now = Date.now();
    const zeroVector = new Float32Array(embedder.dimensions);

    await insertFileRecord(table, {
      id,
      vector: zeroVector,
      original_name: originalName,
      content_type: contentType,
      file_path: filePath,
      file_hash: fileHash,
      file_size: fileSize,
      description: tldr,
      digest,
      tags,
      taxonomy_path: [],
      embedding_model: embedder.modelId,
      task_type: "RETRIEVAL_DOCUMENT" as TaskType,
      searchable_text: null,
      parent_id: null,
      chunk_index: null,
      chunk_label: null,
      status: "pending",
      error_message: null,
      deleted_at: null,
      created_at: now,
      updated_at: now,
      source_url: sourceUrl,
      display_name: storedDisplayName,
    });

    await release();

    const indexingResult = await completeIndexing(sourcePath, {
      id,
      originalName,
      contentType,
      filePath,
      fileHash,
      fileSize,
      tldr,
      tags,
      sourceUrl,
      displayName: storedDisplayName,
      createdAt: now,
    }, opts);

    return {
      id,
      fileHash,
      status: "stored",
      chunks: indexingResult.chunks,
      tokensUsed: indexingResult.tokensUsed,
      indexed: indexingResult.indexed,
      ...(indexingResult.indexError ? { indexError: indexingResult.indexError } : {}),
    };
  } catch (err) {
    try {
      await release();
    } catch {
      // lock was already released
    }
    throw err;
  }
}

function toDuplicateResult(row: FileRecord, fileHash: string): StoreResult {
  return {
    id: row.id,
    fileHash,
    status: "duplicate",
    duplicateId: row.id,
    chunks: 0,
    tokensUsed: 0,
    indexed: row.status === "embedded",
    ...(row.error_message ? { indexError: row.error_message } : {}),
  };
}

async function completeIndexing(
  sourcePath: string,
  target: PendingFileRecord,
  opts: StoreOptions,
): Promise<IndexingResult> {
  const chunkerType = selectChunker(target.contentType);
  let chunks: Chunk[] = [];
  let searchableText: string | null = null;
  const embeddings: Float32Array[] = [];
  let tokensUsed = 0;

  try {
    ({ chunks, searchableText } = await buildChunksForEmbedding({
      sourcePath,
      contentType: target.contentType,
      chunkerType,
      originalName: target.originalName,
      tldr: target.tldr,
      tags: target.tags,
    }));

    for (const chunk of chunks) {
      const embedding = await opts.embedder.embed(buildChunkEmbedInput(chunk, target.originalName));
      embeddings.push(embedding);
      if (chunk.text) {
        tokensUsed += Math.ceil(chunk.text.length / 4);
      }
    }
  } catch (err) {
    const indexError = await markFileStored(target.id, join(opts.wsPath, "db"), opts.wsPath, err);
    return {
      chunks: 0,
      tokensUsed,
      indexed: false,
      indexError,
    };
  }

  const parentVector = averageEmbeddings(embeddings, opts.embedder.dimensions);
  const release = await acquireLock(opts.wsPath);
  try {
    const db = await createDatabase(join(opts.wsPath, "db"));
    const table = await getFilesTable(db, opts.wsPath);

    if (chunks.length > 1) {
      for (let i = 0; i < chunks.length; i++) {
        await insertFileRecord(table, {
          id: uuidv7(),
          vector: embeddings[i],
          original_name: target.originalName,
          content_type: target.contentType,
          file_path: target.filePath,
          file_hash: target.fileHash,
          file_size: target.fileSize,
          description: target.tldr,
          digest: null,
          tags: target.tags,
          taxonomy_path: [],
          embedding_model: opts.embedder.modelId,
          task_type: "RETRIEVAL_DOCUMENT" as TaskType,
          searchable_text: chunks[i].text?.slice(0, 10_000) ?? null,
          parent_id: target.id,
          chunk_index: chunks[i].index,
          chunk_label: chunks[i].label,
          status: "embedded",
          error_message: null,
          deleted_at: null,
          created_at: target.createdAt,
          updated_at: Date.now(),
          source_url: target.sourceUrl,
          display_name: target.displayName,
        });
      }
    }

    await table.update({
      where: `id = '${target.id}'`,
      values: {
        status: "embedded",
        vector: Array.from(parentVector),
        searchable_text: searchableText,
        error_message: null,
        updated_at: Date.now(),
      },
    });
  } finally {
    await release();
  }

  try {
    await assignToTaxonomy(parentVector, target.id, target.originalName, { wsPath: opts.wsPath });
  } catch (taxErr) {
    console.error("[taxonomy] assignment failed:", taxErr instanceof Error ? taxErr.message : String(taxErr));
  }

  return {
    chunks: chunks.length,
    tokensUsed,
    indexed: true,
  };
}

async function buildChunksForEmbedding(opts: {
  sourcePath: string;
  contentType: string;
  chunkerType: "text" | "pdf" | "video" | "audio" | "none";
  originalName: string;
  tldr: string | null;
  tags: string[];
}): Promise<{ chunks: Chunk[]; searchableText: string | null }> {
  const metadataText = [opts.originalName, opts.tldr ?? "", opts.tags.join(" ")]
    .filter(Boolean)
    .join(" ") || null;

  if (opts.chunkerType === "text") {
    const content = await readFile(opts.sourcePath, "utf-8");
    return {
      searchableText: content.slice(0, 10_000),
      chunks: chunkText(content, { fileName: opts.originalName }),
    };
  }

  if (opts.chunkerType === "pdf") {
    return {
      searchableText: metadataText,
      chunks: await chunkPdf(opts.sourcePath),
    };
  }

  if (opts.chunkerType === "audio") {
    return {
      searchableText: metadataText,
      chunks: await prepareBinaryChunksForEmbedding(await chunkAudio(opts.sourcePath)),
    };
  }

  if (opts.chunkerType === "video") {
    return {
      searchableText: metadataText,
      chunks: await prepareBinaryChunksForEmbedding(await chunkVideo(opts.sourcePath)),
    };
  }

  if (opts.contentType.startsWith("image/")) {
    const prepared = await prepareImageFileForEmbedding(opts.sourcePath, opts.contentType);
    return {
      searchableText: metadataText,
      chunks: [{ index: 0, label: "full", data: prepared.data, mimeType: prepared.mimeType }],
    };
  }

  if (isEmbeddableMediaType(opts.contentType)) {
    const data = await readFile(opts.sourcePath);
    const prepared = await prepareBinaryForEmbedding(data, opts.contentType);
    return {
      searchableText: metadataText,
      chunks: [{ index: 0, label: "full", data: prepared.data, mimeType: prepared.mimeType }],
    };
  }

  throw new Error(`Unsupported file type for Gemini embeddings: ${opts.contentType}`);
}

async function prepareBinaryChunksForEmbedding(chunks: Chunk[]): Promise<Chunk[]> {
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

function buildChunkEmbedInput(chunk: Chunk, title: string): EmbedInput {
  if (chunk.text != null) {
    return {
      parts: [{ kind: "text", text: chunk.text }],
      taskType: "RETRIEVAL_DOCUMENT",
      title,
    };
  }

  if (chunk.data && chunk.mimeType) {
    return {
      parts: [{ kind: "inline-data", data: chunk.data, mimeType: chunk.mimeType }],
      taskType: "RETRIEVAL_DOCUMENT",
      title,
    };
  }

  throw new Error(`Chunk ${chunk.label} does not contain embeddable content`);
}

async function markFileStored(
  id: string,
  dbPath: string,
  wsPath: string,
  err: unknown,
): Promise<string> {
  const indexError = err instanceof Error ? err.message : String(err);
  const release = await acquireLock(wsPath);
  try {
    const db = await createDatabase(dbPath);
    const table = await getFilesTable(db, wsPath);
    await table.update({
      where: `id = '${id}'`,
      values: {
        status: "stored",
        error_message: indexError,
        updated_at: Date.now(),
      },
    });
  } finally {
    await release();
  }

  return indexError;
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

export async function storeBatch(
  inputs: StoreInput[],
  opts: StoreOptions & { concurrency?: number },
): Promise<StoreResult[]> {
  const concurrency = opts.concurrency ?? 3;
  const limit = pLimit(concurrency);

  const promises = inputs.map((item) => limit(() => store(item, opts)));
  return Promise.all(promises);
}
