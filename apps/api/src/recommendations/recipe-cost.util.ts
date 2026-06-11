import { Prisma } from '@prisma/client';

/**
 * Shared recipe-cost estimation: cheapest effective cost per ingredient from
 * ProductIngredientMatch x latest Price, fetched in one query.
 *
 * Used by recommendations, meal planning and the AI assistant.
 */

/** Minimal Prisma surface so callers/tests can pass a mock. */
export interface RawQueryable {
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]): Promise<T>;
}

export interface IngredientCostRow {
  ingredientId: string;
  /** Cheapest latest pack price across matched products (cents). */
  minPriceCents: number | null;
  /** Cheapest latest normalized per-kg price across matched products (cents). */
  minPerKgCents: number | null;
}

/**
 * One efficient query: for every ingredient id, find the latest price of each
 * matched product (lateral join) and take the cheapest pack / per-kg price.
 */
export async function fetchIngredientCosts(
  prisma: RawQueryable,
  ingredientIds: string[],
): Promise<Map<string, IngredientCostRow>> {
  const map = new Map<string, IngredientCostRow>();
  if (ingredientIds.length === 0) return map;
  const unique = [...new Set(ingredientIds)];

  const rows = await prisma.$queryRaw<
    Array<{ ingredientid: string; minpricecents: number | null; minperkgcents: number | null }>
  >(Prisma.sql`
    SELECT m."ingredientId" AS ingredientid,
           MIN(lp."priceCents")::int AS minpricecents,
           MIN(lp."pricePerKgCents")::int AS minperkgcents
    FROM product_ingredient_matches m
    JOIN LATERAL (
      SELECT p."priceCents", p."pricePerKgCents"
      FROM prices p
      WHERE p."productId" = m."productId"
      ORDER BY p."effectiveAt" DESC
      LIMIT 1
    ) lp ON TRUE
    WHERE m."ingredientId" = ANY(${unique}::uuid[])
    GROUP BY m."ingredientId"
  `);

  for (const row of rows) {
    map.set(row.ingredientid, {
      ingredientId: row.ingredientid,
      minPriceCents: row.minpricecents !== null ? Number(row.minpricecents) : null,
      minPerKgCents: row.minperkgcents !== null ? Number(row.minperkgcents) : null,
    });
  }
  return map;
}

export interface CostableIngredient {
  ingredientId: string | null;
  normalizedQtyG: number | null;
  optional: boolean;
}

export interface RecipeCostEstimate {
  /** Total estimated cost for the whole recipe (all servings), cents. */
  totalCents: number;
  /** Ingredients that contributed a price. */
  matchedCount: number;
  /** Total non-optional ingredients considered. */
  ingredientCount: number;
  /** matchedCount / ingredientCount (1 when there are no ingredients). */
  coverage: number;
}

/**
 * Estimate the cost of a recipe from pre-fetched ingredient costs.
 * - per-kg price x required grams when both are known
 * - otherwise one pack at the cheapest pack price
 * - unmatched ingredients contribute 0 cost (tracked via coverage)
 */
export function estimateRecipeCost(
  ingredients: CostableIngredient[],
  costs: Map<string, IngredientCostRow>,
): RecipeCostEstimate {
  let totalCents = 0;
  let matchedCount = 0;
  let ingredientCount = 0;

  for (const ing of ingredients) {
    if (ing.optional) continue;
    ingredientCount += 1;
    if (!ing.ingredientId) continue;
    const row = costs.get(ing.ingredientId);
    if (!row) continue;
    if (row.minPerKgCents !== null && ing.normalizedQtyG !== null && ing.normalizedQtyG > 0) {
      totalCents += Math.round((row.minPerKgCents * ing.normalizedQtyG) / 1000);
      matchedCount += 1;
    } else if (row.minPriceCents !== null) {
      totalCents += row.minPriceCents;
      matchedCount += 1;
    }
  }

  return {
    totalCents,
    matchedCount,
    ingredientCount,
    coverage: ingredientCount === 0 ? 1 : matchedCount / ingredientCount,
  };
}
