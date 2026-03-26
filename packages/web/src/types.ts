export interface ProjectionPoint {
  id: string;
  x: number;
  y: number;
  z: number;
  fileName: string;
  contentType: string;
  tags: string[];
  previewUrl?: string;
}

export interface SearchResult {
  id: string;
  score: number;
  file: string;
  contentType: string;
  fileSize: number;
  tags: string[];
  taxonomyPath: string[];
  matchedChunk?: { index: number; label: string };
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
  itemCount: number;
  children?: TaxonomyNode[];
}

export interface FileInfo {
  id: string;
  name: string;
  original_name: string;
  display_name?: string;
  content_type: string;
  file_size: number;
  tags: string[];
  tldr?: string | null;
  digest?: string | null;
  created_at: number;
  updated_at: number;
  source_url?: string | null;
}

export interface FileTagInfo {
  id: string;
  tags: string[];
}

export interface PotRecord {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  created_at: number;
  updated_at: number;
}

export interface UploadResult {
  id: string;
  fileHash: string;
  status: "stored" | "duplicate";
  duplicateId?: string;
  chunks: number;
  tokensUsed: number;
  indexed: boolean;
  indexError?: string;
}

export interface PotShare {
  id: string;
  pot_id: string;
  pot_slug: string;
  kind: "link" | "principal";
  principal: string | null;
  role: "read" | "write";
  status: "pending" | "active" | "revoked" | "expired";
  token: string | null;
  expires_at: number | null;
  created_at: number;
  approved_at: number | null;
  revoked_at: number | null;
}

export type ViewMode = "space" | "files";
