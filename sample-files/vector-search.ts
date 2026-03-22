/**
 * Vector similarity search using cosine distance.
 */

export interface SearchResult {
  id: string;
  score: number;
  metadata: Record<string, unknown>;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

export function search(
  query: number[],
  index: Map<string, number[]>,
  topK: number = 10,
): SearchResult[] {
  const results: SearchResult[] = [];

  for (const [id, vector] of index.entries()) {
    const score = cosineSimilarity(query, vector);
    results.push({ id, score, metadata: {} });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}
