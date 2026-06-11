/** Pure, SQL-free decision logic for product <-> ingredient matching. */

export type MatchPath = 'embedding' | 'trigram';

export interface MatchCandidate {
  id: string;
  sim: number;
}

export const TRIGRAM_CANDIDATE_FLOOR = 0.3;

/**
 * Decide which matching strategy to use: vector similarity requires
 * embeddings on BOTH sides; otherwise fall back to trigram similarity.
 */
export function decideMatchPath(
  sourceHasEmbedding: boolean,
  targetEmbeddingCount: number,
): MatchPath {
  return sourceHasEmbedding && targetEmbeddingCount > 0 ? 'embedding' : 'trigram';
}

/**
 * Filter candidates: dedupe (keep the highest similarity per id), drop those
 * below the floor, then keep only those meeting the upsert threshold.
 */
export function filterCandidates(
  candidates: MatchCandidate[],
  threshold: number,
  floor = 0,
): MatchCandidate[] {
  const best = new Map<string, number>();
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate.sim)) {
      continue;
    }
    const existing = best.get(candidate.id);
    if (existing === undefined || candidate.sim > existing) {
      best.set(candidate.id, candidate.sim);
    }
  }
  return [...best.entries()]
    .map(([id, sim]) => ({ id, sim }))
    .filter((c) => c.sim > floor && c.sim >= threshold)
    .sort((a, b) => b.sim - a.sim);
}

/** Build the text used to embed a product. */
export function productEmbeddingText(name: string, brand: string | null, category: string | null): string {
  return [name, brand, category].filter(Boolean).join(' ').trim();
}

/** Build the text used to embed an ingredient. */
export function ingredientEmbeddingText(displayName: string, category: string): string {
  return `${displayName} ${category.toLowerCase().replace(/_/g, ' ')}`.trim();
}

/** Format a number vector as a pgvector literal: [v1,v2,...] */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}
