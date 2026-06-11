import { toCanonical } from '@smart-grocery/shared';

export interface CoverageItem {
  ingredientId: string | null;
  quantity: number;
  unit: string;
  ingredient: { density: number | null; gramsPerPiece: number | null } | null;
}

/**
 * Aggregate pantry items into grams available per ingredient.
 *
 * Conversion rules (via shared toCanonical):
 * - mass units convert directly to grams
 * - volume units convert via ingredient density when known, otherwise 1 g/ml
 * - count units convert via ingredient gramsPerPiece (or shared per-unit
 *   defaults); pieces with no known weight contribute 0 g, since we cannot
 *   express them as mass.
 */
export function computeCoverageGrams(items: CoverageItem[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    if (!item.ingredientId) continue;
    const norm = toCanonical(item.quantity, item.unit, {
      density: item.ingredient?.density ?? null,
      gramsPerPiece: item.ingredient?.gramsPerPiece ?? null,
    });
    let grams = 0;
    if (norm.unit === 'g') grams = norm.value;
    else if (norm.unit === 'ml') grams = norm.value; // approximate 1 g/ml when density unknown
    // 'piece' with unknown weight: contributes 0 g
    if (grams > 0) {
      map.set(item.ingredientId, (map.get(item.ingredientId) ?? 0) + grams);
    }
  }
  return map;
}

/** Whole days until expiry (negative when already expired), null when no date. */
export function daysUntilExpiry(expiresAt: Date | null, now: Date = new Date()): number | null {
  if (!expiresAt) return null;
  const ms = expiresAt.getTime() - now.getTime();
  return Math.ceil(ms / 86_400_000);
}
