export interface ProjectionPoint {
  id: string;
  x: number;
  y: number;
  z: number;
  fileName: string;
  contentType: string;
  tags: string[];
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
  original_name: string;
  content_type: string;
  file_size: number;
  tags: string[];
  taxonomy_path: string[];
  description: string | null;
  created_at: number;
}
