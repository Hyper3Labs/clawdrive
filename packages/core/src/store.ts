// packages/core/src/store.ts
import { readFile, stat } from "node:fs/promises";
import { join, extname, basename, relative } from "node:path";
import { uuidv7 } from "uuidv7";
import pLimit from "p-limit";
import type { StoreInput, StoreResult, FileRecord, TaskType } from "./types.js";
import type { EmbeddingProvider } from "./embedding/types.js";
import { createDatabase, getFilesTable, insertFileRecord, queryFiles } from "./storage/db.js";
import { hashFile, storeFile } from "./storage/files.js";
import { acquireLock } from "./lock.js";
import { detectMimeType, selectChunker } from "./chunker/detect.js";
import { chunkText } from "./chunker/text.js";
import type { Chunk } from "./chunker/types.js";

export interface StoreOptions {
  wsPath: string;
  embedder: EmbeddingProvider;
}

export async function store(input: StoreInput, opts: StoreOptions): Promise<StoreResult> {
  const { wsPath, embedder } = opts;
  const { sourcePath, tags = [], description = null, sourceUrl = null } = input;
  const dbPath = join(wsPath, "db");
  const filesDir = join(wsPath, "files");

  // 1. Hash the source file and get file stats
  const [fileHash, fileStat] = await Promise.all([
    hashFile(sourcePath),
    stat(sourcePath),
  ]);
  const fileSize = fileStat.size;
  const originalName = basename(sourcePath);
  const ext = extname(sourcePath);

  // 2. Acquire lock, check for duplicate by hash
  let release = await acquireLock(wsPath);
  try {
    const db = await createDatabase(dbPath);
    const table = await getFilesTable(db);
    const existingRows = await queryFiles(table);
    const duplicate = existingRows.find(
      (r) => r.file_hash === fileHash && r.parent_id === null,
    );

    if (duplicate) {
      release();
      return {
        id: duplicate.id,
        fileHash,
        status: "duplicate",
        duplicateId: duplicate.id,
        chunks: 0,
        tokensUsed: 0,
      };
    }

    // 3. Generate UUID v7
    const id = uuidv7();

    // 4. Copy file to workspace
    const destPath = await storeFile(sourcePath, filesDir, id, ext);
    // Compute relative file_path: e.g., "2026-03/abc123.md"
    const filePath = relative(filesDir, destPath);

    // 5. Detect MIME type, select chunker
    const contentType = detectMimeType(originalName);
    const chunkerType = selectChunker(contentType);

    // 6. Insert parent row with status "pending"
    const now = Date.now();
    const zeroVector = new Float32Array(embedder.dimensions);
    const parentRecord: Record<string, unknown> = {
      id,
      vector: zeroVector,
      original_name: originalName,
      content_type: contentType,
      file_path: filePath,
      file_hash: fileHash,
      file_size: fileSize,
      description,
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
    };
    await insertFileRecord(table, parentRecord);

    // Release lock during embedding
    await release();

    // 7. Chunk and embed
    let chunks: Chunk[] = [];
    let searchableText: string | null = null;
    let tokensUsed = 0;

    if (chunkerType === "text") {
      const content = await readFile(sourcePath, "utf-8");
      searchableText = content.slice(0, 10_000);
      chunks = chunkText(content, { fileName: originalName });
    } else {
      // For binary/unsupported files: single chunk with metadata as searchable text
      searchableText = [originalName, description ?? "", tags.join(" ")]
        .filter(Boolean)
        .join(" ");
      // For images/binary: embed as a single chunk with text description
      chunks = [{ index: 0, label: "full", text: searchableText }];
    }

    // 8. Embed each chunk
    const embeddings: Float32Array[] = [];
    try {
      for (const chunk of chunks) {
        const embedding = await embedder.embed({
          kind: "text",
          text: chunk.text ?? "",
          taskType: "RETRIEVAL_DOCUMENT",
        });
        embeddings.push(embedding);
        tokensUsed += Math.ceil((chunk.text?.length ?? 0) / 4);
      }
    } catch (err) {
      // On embedding failure: mark as failed
      release = await acquireLock(wsPath);
      try {
        const db2 = await createDatabase(dbPath);
        const table2 = await getFilesTable(db2);
        await table2.update({
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
      throw err;
    }

    // 9. If multiple chunks, insert child rows
    release = await acquireLock(wsPath);
    try {
      const db3 = await createDatabase(dbPath);
      const table3 = await getFilesTable(db3);

      if (chunks.length > 1) {
        for (let i = 0; i < chunks.length; i++) {
          const childId = uuidv7();
          const childRecord: Record<string, unknown> = {
            id: childId,
            vector: embeddings[i],
            original_name: originalName,
            content_type: contentType,
            file_path: filePath,
            file_hash: fileHash,
            file_size: fileSize,
            description,
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
          };
          await insertFileRecord(table3, childRecord);
        }
      }

      // 10. Update parent row: status -> "embedded", set vector, searchable_text
      await table3.update({
        where: `id = '${id}'`,
        values: {
          status: "embedded",
          vector: Array.from(embeddings[0]),
          searchable_text: searchableText,
          updated_at: Date.now(),
        },
      });
    } finally {
      await release();
    }

    return {
      id,
      fileHash,
      status: "stored",
      chunks: chunks.length,
      tokensUsed,
    };
  } catch (err) {
    // If the lock is still held (early error), make sure we release
    // The lock release is idempotent in proper-lockfile
    try { await release(); } catch { /* already released */ }
    throw err;
  }
}

export async function storeBatch(
  inputs: StoreInput[],
  opts: StoreOptions & { concurrency?: number },
): Promise<StoreResult[]> {
  const concurrency = opts.concurrency ?? 3;
  const limit = pLimit(concurrency);

  const promises = inputs.map((input) =>
    limit(() => store(input, opts)),
  );

  return Promise.all(promises);
}
