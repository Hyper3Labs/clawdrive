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
import { setDigest } from "./digests.js";
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
import type { StoreInput, StoreResult, TaskType } from "./types.js";

export interface StoreOptions {
  wsPath: string;
  embedder: EmbeddingProvider;
}

export async function store(input: StoreInput, opts: StoreOptions): Promise<StoreResult> {
  const { wsPath, embedder } = opts;
  const { sourcePath, tags = [], sourceUrl = null } = input;
  const tldr = normalizeTldr(input.tldr ?? input.abstract ?? input.description ?? null);
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
    const table = await getFilesTable(db);
    const existingRows = await queryFiles(table);
    const duplicate = existingRows.find(
      (row) =>
        row.file_hash === fileHash
        && row.parent_id === null
        && row.embedding_model === embedder.modelId
        && row.status !== "failed",
    );

    if (duplicate) {
      await release();
      return {
        id: duplicate.id,
        fileHash,
        status: "duplicate",
        duplicateId: duplicate.id,
        chunks: 0,
        tokensUsed: 0,
      };
    }

    const id = uuidv7();
    const destPath = await storeFile(sourcePath, filesDir, id, ext);
    const filePath = relative(filesDir, destPath);
    const contentType = detectMimeType(originalName);
    const chunkerType = selectChunker(contentType);
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
    });

    await release();

    let chunks: Chunk[] = [];
    let searchableText: string | null = null;
    const embeddings: Float32Array[] = [];
    let tokensUsed = 0;

    try {
      ({ chunks, searchableText } = await buildChunksForEmbedding({
        sourcePath,
        contentType,
        chunkerType,
        originalName,
        tldr,
        tags,
      }));

      for (const chunk of chunks) {
        const embedding = await embedder.embed(buildChunkEmbedInput(chunk, originalName));
        embeddings.push(embedding);
        if (chunk.text) {
          tokensUsed += Math.ceil(chunk.text.length / 4);
        }
      }
    } catch (err) {
      await markFileFailed(id, dbPath, wsPath, err);
      throw err;
    }

    const parentVector = averageEmbeddings(embeddings, embedder.dimensions);

    release = await acquireLock(wsPath);
    try {
      const db2 = await createDatabase(dbPath);
      const table2 = await getFilesTable(db2);

      if (chunks.length > 1) {
        for (let i = 0; i < chunks.length; i++) {
          await insertFileRecord(table2, {
            id: uuidv7(),
            vector: embeddings[i],
            original_name: originalName,
            content_type: contentType,
            file_path: filePath,
            file_hash: fileHash,
            file_size: fileSize,
            description: tldr,
            tags,
            taxonomy_path: [],
            embedding_model: embedder.modelId,
            task_type: "RETRIEVAL_DOCUMENT" as TaskType,
            searchable_text: chunks[i].text?.slice(0, 10_000) ?? null,
            parent_id: id,
            chunk_index: chunks[i].index,
            chunk_label: chunks[i].label,
            status: "embedded",
            error_message: null,
            deleted_at: null,
            created_at: now,
            updated_at: Date.now(),
            source_url: sourceUrl,
          });
        }
      }

      await table2.update({
        where: `id = '${id}'`,
        values: {
          status: "embedded",
          vector: Array.from(parentVector),
          searchable_text: searchableText,
          updated_at: Date.now(),
        },
      });
    } finally {
      await release();
    }

    if (input.digest !== undefined) {
      await setDigest(id, input.digest, { wsPath });
    }

    try {
      await assignToTaxonomy(parentVector, id, originalName, { wsPath });
    } catch (taxErr) {
      console.error("[taxonomy] assignment failed:", taxErr instanceof Error ? taxErr.message : String(taxErr));
    }

    return {
      id,
      fileHash,
      status: "stored",
      chunks: chunks.length,
      tokensUsed,
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

async function markFileFailed(
  id: string,
  dbPath: string,
  wsPath: string,
  err: unknown,
): Promise<void> {
  const release = await acquireLock(wsPath);
  try {
    const db = await createDatabase(dbPath);
    const table = await getFilesTable(db);
    await table.update({
      where: `id = '${id}'`,
      values: {
        status: "failed",
        error_message: err instanceof Error ? err.message : String(err),
        updated_at: Date.now(),
      },
    });
  } finally {
    await release();
  }
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
