import type { FileRecord, ShareItemRecord } from "@clawdrive/core";

export interface FileMetadataRecord {
  id: string;
  original_name: string;
  content_type: string;
  file_size: number;
  created_at: number;
  updated_at: number;
  tldr?: string;
  digest?: string;
  source_url?: string;
}

export interface FileTagRecord {
  id: string;
  tags: string[];
}

interface FileMetadataSource {
  id: string;
  original_name: string;
  content_type: string;
  file_size: number;
  created_at: number;
  updated_at: number;
  source_url: string | null;
  abstract?: string | null;
  digest?: string | null;
  tldr?: string | null;
  description?: string | null;
}

export function toFileMetadataRecord(
  record: FileMetadataSource,
  options?: { includeDigest?: boolean },
): FileMetadataRecord {
  const tldr = record.tldr ?? record.abstract ?? record.description ?? null;

  return {
    id: record.id,
    original_name: record.original_name,
    content_type: record.content_type,
    file_size: record.file_size,
    created_at: record.created_at,
    updated_at: record.updated_at,
    ...(tldr != null ? { tldr } : {}),
    ...(options?.includeDigest && record.digest != null ? { digest: record.digest } : {}),
    ...(record.source_url != null ? { source_url: record.source_url } : {}),
  };
}

export function toFileTagRecord(record: Pick<FileRecord, "id" | "tags">): FileTagRecord {
  return {
    id: record.id,
    tags: [...record.tags],
  };
}

export function toShareItemMetadataRecord(record: ShareItemRecord): FileMetadataRecord {
  return toFileMetadataRecord(record);
}