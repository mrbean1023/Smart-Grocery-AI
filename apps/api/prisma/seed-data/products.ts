/**
 * Deterministic product catalogue generator.
 * Derives 600+ store products from SEED_INGREDIENTS using per-category price
 * heuristics, per-ingredient overrides and store-specific multipliers.
 * No Math.random — a seeded mulberry32 PRNG keeps every run identical.
 */

import { SEED_INGREDIENTS, type SeedIngredient, type SeedIngredientCategory } from './ingredients';
import type { SeedStoreCode } from './stores';

export type SeedPackUnit = 'G' | 'KG' | 'ML' | 'L' | 'PIECE' | 'PACK';

export interface SeedProduct {
  storeCode: SeedStoreCode;
  externalId: string;
  name: string;
  brand: string | null;
  category: string;
  packSize: number;
  packUnit: SeedPackUnit;
  unitCount: number;
  /** Current shelf price; weekly history is derived from this in seed.ts. */
  basePriceCents: number;
  qualityTier: 1 | 2 | 3;
  isOrganic: boolean;
  isHalal: boolean;
  /** Canonical ingredient this product satisfies (drives seeded matching). */
  ingredientName: string;
  /** Seeded match similarity (products are generated from ingredients). */
  similarity: number;
}

// ---------------------------------------------------------------------------
// Deterministic PRNG
// ---------------------------------------------------------------------------

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Pricing heuristics (SGD cents)
// ---------------------------------------------------------------------------

/** Fallback price per kg (or per L for liquids) by category. */
const CATEGORY_PRICE_PER_KG: Record<SeedIngredientCategory, number> = {
  PRODUCE: 450,
  MEAT: 1400,
  SEAFOOD: 2000,
  DAIRY: 900,
  EGGS: 600,
  GRAINS: 350,
  BAKERY: 700,
  CANNED: 800,
  FROZEN: 900,
  CONDIMENTS: 1000,
  SPICES: 2500,
  OILS: 800,
  BEVERAGES: 300,
  SNACKS: 1500,
  NOODLES_PASTA: 500,
  TOFU_SOY: 600,
  SAUCES: 900,
  BAKING: 400,
  OTHER: 800,
};

/** Per-ingredient price-per-kg overrides for realism (SGD cents/kg). */
const PRICE_PER_KG_OVERRIDES: Record<string, number> = {
  'chicken breast': 950,
  'chicken thigh': 850,
  'whole chicken': 650,
  'chicken wings': 800,
  'chicken drumstick': 700,
  'pork belly': 1700,
  'minced pork': 1100,
  'pork ribs': 1500,
  'pork loin': 1300,
  'beef sirloin': 3200,
  'minced beef': 1600,
  'beef brisket': 2200,
  'lamb shoulder': 2400,
  'batang fish': 2200,
  'salmon fillet': 3400,
  'sea bass': 1800,
  'red snapper': 2100,
  pomfret: 2600,
  prawns: 2400,
  squid: 1600,
  mussels: 1100,
  clams: 1000,
  'dried shrimp': 3200,
  'ikan bilis': 2400,
  'jasmine rice': 320,
  'brown rice': 420,
  'basmati rice': 550,
  'glutinous rice': 380,
  garlic: 700,
  ginger: 550,
  'red chilli': 900,
  'chilli padi': 1400,
  'pandan leaves': 1000,
  lemongrass: 600,
  coriander: 1600,
  'kaffir lime leaves': 2400,
  'shiitake mushroom': 1500,
  'enoki mushroom': 900,
  'button mushroom': 1100,
  butter: 1700,
  'cheddar cheese': 2200,
  'whipping cream': 1300,
  'salted egg': 1300,
  'century egg': 1200,
  'firm tofu': 450,
  'silken tofu': 400,
  tempeh: 700,
  'sesame oil': 1600,
  'olive oil': 1400,
  'peanut oil': 900,
  belacan: 1500,
  'laksa paste': 1400,
  'miso paste': 1600,
  'gula melaka': 900,
  peanuts: 900,
  'sesame seeds': 1500,
  'dried shiitake': 3800,
  'red dates': 1800,
  wolfberries: 2600,
  'white pepper': 4000,
  'black pepper': 3500,
  'star anise': 3000,
  cinnamon: 2800,
  'curry leaves': 1200,
};

/** Items priced per piece rather than per kg (cents/piece). */
const PRICE_PER_PIECE: Record<string, number> = {
  'white bread': 250,
  'wholemeal bread': 320,
  'instant noodles': 320, // 5-pack
  'frozen dumplings': 650,
  'canned sardines': 280,
  'luncheon meat': 420,
  'baked beans': 180,
  'canned chickpeas': 220,
  'canned tomatoes': 220,
  'tomato paste': 190,
  'coconut milk': 280,
  'evaporated milk': 200,
  'condensed milk': 230,
  eggs: 38, // per egg → sold in trays
};

/** Typical pack configurations by category: [size, unit, unitCount]. */
const CATEGORY_PACKS: Partial<Record<SeedIngredientCategory, Array<[number, SeedPackUnit, number]>>> = {
  PRODUCE: [
    [300, 'G', 1],
    [500, 'G', 1],
  ],
  MEAT: [
    [300, 'G', 1],
    [500, 'G', 1],
    [1, 'KG', 1],
  ],
  SEAFOOD: [
    [300, 'G', 1],
    [500, 'G', 1],
  ],
  DAIRY: [
    [1, 'L', 1],
    [250, 'G', 1],
  ],
  GRAINS: [
    [1, 'KG', 1],
    [5, 'KG', 1],
  ],
  NOODLES_PASTA: [
    [400, 'G', 1],
    [500, 'G', 1],
  ],
  TOFU_SOY: [[300, 'G', 1]],
  SAUCES: [
    [500, 'ML', 1],
    [750, 'ML', 1],
  ],
  CONDIMENTS: [[250, 'G', 1]],
  SPICES: [
    [50, 'G', 1],
    [100, 'G', 1],
  ],
  OILS: [
    [1, 'L', 1],
    [2, 'L', 1],
  ],
  CANNED: [[400, 'G', 1]],
  FROZEN: [[500, 'G', 1]],
  BAKING: [[1, 'KG', 1]],
  BAKERY: [[400, 'G', 1]],
  EGGS: [
    [10, 'PIECE', 1],
    [30, 'PIECE', 1],
  ],
  SNACKS: [[200, 'G', 1]],
  BEVERAGES: [[1, 'L', 1]],
  OTHER: [[500, 'G', 1]],
};

// ---------------------------------------------------------------------------
// Store assortments
// ---------------------------------------------------------------------------

interface StoreProfile {
  code: SeedStoreCode;
  multiplier: number;
  coverage: number; // probability an ingredient is stocked
  brandPool: string[];
  qualityTier: 1 | 2 | 3;
  halalBias: number; // probability a meat product is halal-certified
}

const STORE_PROFILES: StoreProfile[] = [
  { code: 'FAIRPRICE', multiplier: 1.0, coverage: 0.97, brandPool: ['FairPrice', 'Pasar', 'FairPrice Gold'], qualityTier: 2, halalBias: 0.7 },
  { code: 'SHENG_SIONG', multiplier: 0.93, coverage: 0.88, brandPool: ['Happy Family', 'SS Choice', 'Sheng Siong'], qualityTier: 1, halalBias: 0.6 },
  { code: 'GIANT', multiplier: 0.95, coverage: 0.84, brandPool: ['Giant', 'Meadows', 'First Pick'], qualityTier: 1, halalBias: 0.6 },
  { code: 'PRIME', multiplier: 0.96, coverage: 0.68, brandPool: ['Prime', 'Harvest Fields'], qualityTier: 2, halalBias: 0.6 },
  { code: 'REDMART', multiplier: 1.04, coverage: 0.78, brandPool: ['RedMart', 'RedMart Label', 'Origins'], qualityTier: 2, halalBias: 0.5 },
  { code: 'AMAZON_FRESH', multiplier: 1.06, coverage: 0.58, brandPool: ['Fresh', 'Happy Belly', 'Aplenty'], qualityTier: 2, halalBias: 0.4 },
  { code: 'COLD_STORAGE', multiplier: 1.22, coverage: 0.62, brandPool: ['Cold Storage', 'Meadows Premium', 'Jasons'], qualityTier: 3, halalBias: 0.3 },
];

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

function packCanonicalGrams(size: number, unit: SeedPackUnit, unitCount: number): number {
  switch (unit) {
    case 'G':
    case 'ML':
      return size * unitCount;
    case 'KG':
    case 'L':
      return size * 1000 * unitCount;
    case 'PIECE':
    case 'PACK':
      return size * unitCount; // handled separately for per-piece pricing
  }
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function generateSeedProducts(): SeedProduct[] {
  const products: SeedProduct[] = [];

  for (const ing of SEED_INGREDIENTS) {
    const perPiece = PRICE_PER_PIECE[ing.name];
    const perKg = PRICE_PER_KG_OVERRIDES[ing.name] ?? CATEGORY_PRICE_PER_KG[ing.category];
    const packs = CATEGORY_PACKS[ing.category] ?? [[500, 'G', 1]];

    for (const store of STORE_PROFILES) {
      const rng = mulberry32(hashString(`${store.code}:${ing.name}`));
      if (rng() > store.coverage) continue;

      // 1-2 variants per store: a standard pack and (sometimes) a value/premium pack
      const variantCount = rng() < 0.45 && packs.length > 1 ? 2 : 1;

      for (let v = 0; v < variantCount; v++) {
        const [size, unit, unitCount] = packs[Math.min(v, packs.length - 1)] as [number, SeedPackUnit, number];
        const brand = store.brandPool[Math.floor(rng() * store.brandPool.length)] ?? null;

        let priceCents: number;
        if (perPiece !== undefined && (unit === 'PIECE' || ing.category === 'CANNED' || ing.category === 'BAKERY')) {
          const pieces = unit === 'PIECE' ? size * unitCount : 1;
          priceCents = Math.round(perPiece * Math.max(1, pieces) * store.multiplier * (0.95 + rng() * 0.1));
        } else {
          const grams = packCanonicalGrams(size, unit, unitCount);
          priceCents = Math.round(((perKg * grams) / 1000) * store.multiplier * (0.95 + rng() * 0.1));
        }
        priceCents = Math.max(30, priceCents);

        const premium = store.qualityTier === 3 || (v === 1 && rng() < 0.3);
        const isOrganic = ing.category === 'PRODUCE' && premium && rng() < 0.35;
        const isHalal = (ing.category === 'MEAT' && ing.name.includes('chicken') && rng() < store.halalBias) || false;

        const sizeLabel =
          unit === 'PIECE'
            ? `${size * unitCount} pcs`
            : unit === 'KG' || unit === 'L'
              ? `${size}${unit.toLowerCase()}`
              : `${size}${unit.toLowerCase()}`;

        products.push({
          storeCode: store.code,
          externalId: `${store.code.toLowerCase()}-${ing.name.replace(/\s+/g, '-')}-${v}`,
          name: `${isOrganic ? 'Organic ' : ''}${premium && !isOrganic && v === 1 ? 'Premium ' : ''}${titleCase(ing.displayName)} ${sizeLabel}`,
          brand,
          category: ing.category,
          packSize: size,
          packUnit: unit,
          unitCount,
          basePriceCents: isOrganic ? Math.round(priceCents * 1.45) : priceCents,
          qualityTier: premium ? 3 : store.qualityTier,
          isOrganic,
          isHalal,
          ingredientName: ing.name,
          similarity: 0.86 + rng() * 0.11,
        });
      }
    }
  }

  return products;
}

export type { SeedIngredient };
