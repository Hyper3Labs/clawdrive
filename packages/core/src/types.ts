// packages/core/src/types.ts
export type TaskType =
  | "RETRIEVAL_DOCUMENT"
  | "RETRIEVAL_QUERY"
  | "CODE_RETRIEVAL_QUERY"
  | "QUESTION_ANSWERING"
  | "FACT_VERIFICATION"
  | "CLUSTERING";
export type FileStatus = "pending" | "embedded" | "failed";

export interface FileRecord {
  id: string;
  vector: Float32Array;
  original_name: string;
  content_type: string;
  file_path: string;
  file_hash: string;
  file_size: number;
  tldr: string | null;
  digest: string | null;
  abstract?: string | null;
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
  originalName?: string;
  tags?: string[];
  tldr?: string;
  digest?: string;
  abstract?: string;
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
  query?: string;
  queryImage?: string;
  queryFile?: string;
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
  tldr: string | null;
  abstract?: string | null;
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

export interface ShareItemRecord {
  id: string;
  share_id: string;
  file_id: string;
  original_name: string;
  content_type: string;
  file_size: number;
  tldr: string | null;
  abstract?: string | null;
  created_at: number;
  updated_at: number;
  source_url: string | null;
  shared_at: number;
}

export interface ResolvedShare {
  share: PotShare;
  pot: PotRecord;
  files: FileRecord[];
}

export interface ResolvedPublicShare {
  share: PotShare;
  pot: PotRecord;
  items: ShareItemRecord[];
}

export interface ResolvedPublicShareItem {
  share: PotShare;
  pot: PotRecord;
  item: ShareItemRecord;
  file: FileRecord;
}
