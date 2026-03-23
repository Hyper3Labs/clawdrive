// packages/core/src/types.ts
export type TaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" | "CODE_RETRIEVAL_QUERY" | "CLUSTERING";
export type FileStatus = "pending" | "embedded" | "failed";

export interface FileRecord {
  id: string;
  vector: Float32Array;
  original_name: string;
  content_type: string;
  file_path: string;
  file_hash: string;
  file_size: number;
  description: string | null;
  tags: string[];
  taxonomy_path: string[];
  embedding_model: string;
  task_type: TaskType;
  searchable_text: string | null;
  parent_id: string | null;
  chunk_index: number | null;
  chunk_label: string | null;
  status: FileStatus;
  error_message: string | null;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
  source_url: string | null;
}

export interface StoreInput {
  sourcePath: string;
  tags?: string[];
  description?: string;
  workspaceId?: string;
  sourceUrl?: string;
}

export interface StoreResult {
  id: string;
  fileHash: string;
  status: "stored" | "duplicate";
  duplicateId?: string;
  chunks: number;
  tokensUsed: number;
}

export interface SearchInput {
  query: string;
  queryImage?: string;
  mode?: "vector" | "fts" | "hybrid";
  contentType?: string;
  tags?: string[];
  pot?: string;
  after?: Date;
  before?: Date;
  limit?: number;
  minScore?: number;
}

export interface SearchResult {
  id: string;
  score: number;
  file: string;
  contentType: string;
  fileSize: number;
  tags: string[];
  taxonomyPath: string[];
  matchedChunk?: { index: number; label: string; };
  totalChunks: number;
  filePath: string;
  description: string | null;
}

export interface TaxonomyNode {
  id: string;
  label: string;
  parentId: string | null;
  centroidVector: Float32Array;
  itemCount: number;
}

export interface PotRecord {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  created_at: number;
  updated_at: number;
}

export type ShareKind = "link" | "principal";
export type ShareRole = "read" | "write";
export type ShareStatus = "pending" | "active" | "revoked" | "expired";

export interface PotShare {
  id: string;
  pot_id: string;
  pot_slug: string;
  kind: ShareKind;
  principal: string | null;
  role: ShareRole;
  status: ShareStatus;
  token: string | null;
  expires_at: number | null;
  created_at: number;
  approved_at: number | null;
  revoked_at: number | null;
}

export interface ResolvedShare {
  share: PotShare;
  pot: PotRecord;
  files: FileRecord[];
}
