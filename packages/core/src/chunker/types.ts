export interface Chunk {
  index: number;
  label: string; // "pages 1-6", "Section: Methods", "0:00-2:00"
  text?: string; // for text chunks
  data?: Buffer; // for binary chunks (PDF pages, video segments)
  mimeType?: string; // for binary chunks
}

export interface ChunkOptions {
  maxTokens?: number;
  minTokens?: number;
  fileName?: string;
  pdfPages?: number;
  videoSeconds?: number;
  audioSeconds?: number;
}
