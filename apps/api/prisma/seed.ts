/**
 * Production seeder — idempotent. Populates:
 *  stores, ingredients (+aliases/nutrition), substitutions, products,
 *  product↔ingredient matches, 52 weeks of price history, 12 SG recipes
 *  (+nutrition), demo user (+premium subscription, pantry).
 *
 * Run: npm run db:seed -w apps/api
 */

import { PrismaClient, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { SEED_STORES } from './seed-data/stores';
import { SEED_INGREDIENTS } from './seed-data/ingredients';
import { generateSeedProducts, mulberry32, hashString, type SeedProduct } from './seed-data/products';
import { SEED_RECIPES } from './seed-data/recipes';
import { INGREDIENT_IMAGES, RECIPE_IMAGES } from './seed-data/images';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Substitutions (canonical name pairs)
// ---------------------------------------------------------------------------

const SUBSTITUTIONS: Array<[from: string, to: string, ratio: number, notes: string]> = [
  ['chicken thigh', 'chicken breast', 1, 'Leaner; reduce cooking time slightly'],
  ['chicken breast', 'chicken thigh', 1, 'Juicier; slightly higher fat'],
  ['whole chicken', 'chicken thigh', 0.7, 'Use bone-in thighs for similar flavour'],
  ['light soy sauce', 'tamari', 1, 'Gluten-free alternative'],
  ['dark soy sauce', 'kecap manis', 0.8, 'Sweeter — reduce added sugar'],
  ['bee hoon', 'tang hoon', 1, 'Glass noodles cook faster'],
  ['kway teow', 'yellow noodles', 1, 'Different texture, same dishes'],
  ['yellow noodles', 'hokkien noodles', 1, 'Very similar thick noodles'],
  ['butter', 'vegetable oil', 0.8, 'For frying, not baking'],
  ['fresh milk', 'soy milk', 1, 'Dairy-free swap'],
  ['whipping cream', 'coconut milk', 1, 'Adds coconut flavour'],
  ['kangkong', 'chye sim', 1, 'Any leafy green stir-fries well'],
  ['kai lan', 'broccoli', 1, 'Similar bite and sweetness'],
  ['bok choy', 'chye sim', 1, 'Interchangeable in soups and stir-fries'],
  ['minced pork', 'minced beef', 1, 'Slightly stronger flavour'],
  ['minced pork', 'firm tofu', 1, 'Vegetarian swap — crumble and season well'],
  ['prawns', 'squid', 1, 'Adjust cooking time down'],
  ['sea bass', 'red snapper', 1, 'Both steam beautifully'],
  ['batang fish', 'sea bass', 1, 'Similar firm white flesh'],
  ['jasmine rice', 'brown rice', 1, 'More fibre; needs more water'],
  ['white sugar', 'gula melaka', 1, 'Deeper caramel flavour'],
  ['lime', 'lemon', 1, 'Slightly less floral'],
  ['galangal', 'ginger', 1, 'Milder; acceptable in a pinch'],
  ['oyster sauce', 'hoisin sauce', 0.8, 'Sweeter — reduce sugar elsewhere'],
  ['fish sauce', 'light soy sauce', 1, 'Less funk, still salty-savoury'],
  ['firm tofu', 'tempeh', 1, 'Nuttier and firmer'],
  ['plain flour', 'rice flour', 1, 'Gluten-free; crispier coatings'],
  ['vegetable oil', 'peanut oil', 1, 'Higher smoke point, nutty aroma'],
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function packCanonical(p: SeedProduct): { grams: number | null; ml: number | null; pieces: number | null } {
  switch (p.packUnit) {
    case 'G':
      return { grams: p.packSize * p.unitCount, ml: null, pieces: null };
    case 'KG':
      return { grams: p.packSize * 1000 * p.unitCount, ml: null, pieces: null };
    case 'ML':
      return { grams: null, ml: p.packSize * p.unitCount, pieces: null };
    case 'L':
      return { grams: null, ml: p.packSize * 1000 * p.unitCount, pieces: null };
    case 'PIECE':
    case 'PACK':
      return { grams: null, ml: null, pieces: p.packSize * p.unitCount };
  }
}

function normalizedPrices(p: SeedProduct, priceCents: number) {
  const { grams, ml, pieces } = packCanonical(p);
  return {
    pricePerKgCents: grams ? Math.round((priceCents / grams) * 1000) : null,
    pricePerLCents: ml ? Math.round((priceCents / ml) * 1000) : null,
    pricePerPieceCents: pieces ? Math.round(priceCents / pieces) : null,
  };
}

function healthScore(perServing: { proteinG: number; fibreG: number; sodiumMg: number; sugarG: number; fatG: number }): number {
  let score = 70;
  score += Math.min(20, perServing.proteinG * 0.5);
  score += Math.min(10, perServing.fibreG * 2);
  score -= Math.min(25, perServing.sodiumMg / 80);
  score -= Math.min(15, Math.max(0, perServing.sugarG - 10) * 1.5);
  score -= Math.min(15, Math.max(0, perServing.fatG - 25));
  return Math.round(Math.max(0, Math.min(100, score)) * 10) / 10;
}

// ---------------------------------------------------------------------------
// Seed steps
// ---------------------------------------------------------------------------

async function seedStores(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const s of SEED_STORES) {
    const row = await prisma.store.upsert({
      where: { code: s.code },
      update: {
        deliveryFeeCents: s.deliveryFeeCents,
        freeDeliveryMinCents: s.freeDeliveryMinCents,
        minOrderCents: s.minOrderCents,
        qualityScore: s.qualityScore,
      },
      create: {
        code: s.code,
        name: s.name,
        websiteUrl: s.websiteUrl,
        supportsDelivery: s.supportsDelivery,
        deliveryFeeCents: s.deliveryFeeCents,
        freeDeliveryMinCents: s.freeDeliveryMinCents,
        minOrderCents: s.minOrderCents,
        avgDeliveryDays: s.avgDeliveryDays,
        qualityScore: s.qualityScore,
      },
    });
    ids.set(s.code, row.id);
  }
  console.log(`✔ ${ids.size} stores`);
  return ids;
}

async function seedIngredients(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const ing of SEED_INGREDIENTS) {
    const row = await prisma.ingredient.upsert({
      where: { name: ing.name },
      update: {
        category: ing.category,
        density: ing.density ?? null,
        gramsPerPiece: ing.gramsPerPiece ?? null,
        imageUrl: INGREDIENT_IMAGES[ing.name] ?? null,
      },
      create: {
        name: ing.name,
        displayName: ing.displayName,
        category: ing.category,
        defaultUnit: ing.defaultUnit,
        density: ing.density ?? null,
        gramsPerPiece: ing.gramsPerPiece ?? null,
        imageUrl: INGREDIENT_IMAGES[ing.name] ?? null,
      },
    });
    ids.set(ing.name, row.id);

    await prisma.ingredientNutrition.upsert({
      where: { ingredientId: row.id },
      update: { ...ing.nutrition },
      create: { ingredientId: row.id, ...ing.nutrition, source: 'seed' },
    });

    await prisma.ingredientAlias.createMany({
      data: ing.aliases.map((alias) => ({ ingredientId: row.id, alias: alias.toLowerCase() })),
      skipDuplicates: true,
    });
  }
  console.log(`✔ ${ids.size} ingredients (+aliases, nutrition)`);
  return ids;
}

async function seedSubstitutions(ingredientIds: Map<string, string>) {
  let count = 0;
  for (const [from, to, ratio, notes] of SUBSTITUTIONS) {
    const fromId = ingredientIds.get(from);
    const toId = ingredientIds.get(to);
    if (!fromId || !toId) {
      console.warn(`  ! substitution skipped (unknown ingredient): ${from} → ${to}`);
      continue;
    }
    await prisma.ingredientSubstitution.upsert({
      where: { fromIngredientId_toIngredientId: { fromIngredientId: fromId, toIngredientId: toId } },
      update: { ratio, notes },
      create: { fromIngredientId: fromId, toIngredientId: toId, ratio, notes, confidence: 0.85 },
    });
    count++;
  }
  console.log(`✔ ${count} substitutions`);
}

async function seedProducts(
  storeIds: Map<string, string>,
  ingredientIds: Map<string, string>,
): Promise<void> {
  const seedProducts = generateSeedProducts();
  const anchor = Date.now();
  let created = 0;
  let priced = 0;

  for (const sp of seedProducts) {
    const storeId = storeIds.get(sp.storeCode);
    const ingredientId = ingredientIds.get(sp.ingredientName);
    if (!storeId || !ingredientId) continue;

    const imageUrl = INGREDIENT_IMAGES[sp.ingredientName] ?? null;
    const product = await prisma.product.upsert({
      where: { storeId_externalId: { storeId, externalId: sp.externalId } },
      update: { isAvailable: true, imageUrl },
      create: {
        storeId,
        externalId: sp.externalId,
        name: sp.name,
        brand: sp.brand,
        category: sp.category,
        packSize: sp.packSize,
        packUnit: sp.packUnit,
        unitCount: sp.unitCount,
        qualityTier: sp.qualityTier,
        isOrganic: sp.isOrganic,
        isHalal: sp.isHalal,
        imageUrl,
      },
    });
    created++;

    await prisma.productIngredientMatch.upsert({
      where: { productId_ingredientId: { productId: product.id, ingredientId } },
      update: { similarity: sp.similarity },
      create: {
        productId: product.id,
        ingredientId,
        similarity: Math.round(sp.similarity * 100) / 100,
        isVerified: true,
        matchedBy: 'seed',
      },
    });

    // 52 weeks of history + current price — only when the product has none.
    const existing = await prisma.price.count({ where: { productId: product.id } });
    if (existing > 0) continue;

    const rng = mulberry32(hashString(`price:${sp.externalId}`));
    const rows: Prisma.PriceCreateManyInput[] = [];
    for (let w = 51; w >= 0; w--) {
      const effectiveAt = new Date(anchor - w * WEEK_MS);
      // gentle 8%/yr inflation drift toward today's basePriceCents + ±4% noise
      const drift = 1 - (0.08 * w) / 52;
      const noise = 0.96 + rng() * 0.08;
      let priceCents = Math.max(30, Math.round(sp.basePriceCents * drift * noise));
      const isPromo = w !== 0 && rng() < 0.09;
      let wasPriceCents: number | null = null;
      if (isPromo) {
        wasPriceCents = priceCents;
        priceCents = Math.round(priceCents * (0.75 + rng() * 0.13)); // 12–25% off
      }
      if (w === 0) priceCents = sp.basePriceCents;
      rows.push({
        productId: product.id,
        priceCents,
        wasPriceCents,
        isPromo,
        source: 'SEED',
        confidence: 1,
        effectiveAt,
        ...normalizedPrices(sp, priceCents),
      });
    }
    await prisma.price.createMany({ data: rows });
    priced += rows.length;
  }
  console.log(`✔ ${created} products, ${priced} price points`);
}

async function seedRecipes(ingredientIds: Map<string, string>) {
  const nutritionByName = new Map(SEED_INGREDIENTS.map((i) => [i.name, i.nutrition]));
  let created = 0;

  for (const r of SEED_RECIPES) {
    const existing = await prisma.recipe.findFirst({ where: { title: r.title, isPublic: true } });
    if (existing) {
      const imageUrl = RECIPE_IMAGES[r.title];
      if (imageUrl && existing.imageUrl !== imageUrl) {
        await prisma.recipe.update({ where: { id: existing.id }, data: { imageUrl } });
      }
      continue;
    }

    const recipe = await prisma.recipe.create({
      data: {
        title: r.title,
        description: r.description,
        imageUrl: RECIPE_IMAGES[r.title] ?? null,
        source: 'MANUAL',
        status: 'READY',
        servings: r.servings,
        prepMinutes: r.prepMinutes,
        cookMinutes: r.cookMinutes,
        cuisine: r.cuisine,
        tags: r.tags,
        instructions: r.instructions,
        isPublic: true,
        ingredients: {
          create: r.ingredients.map((line, i) => ({
            ingredientId: ingredientIds.get(line.name) ?? null,
            rawText: line.rawText,
            quantity: line.quantity,
            unit: line.unit,
            normalizedQtyG: line.grams,
            optional: line.optional ?? false,
            matchConfidence: ingredientIds.has(line.name) ? 1 : null,
            sortOrder: i,
          })),
        },
      },
    });

    // Nutrition per serving from per-100g ingredient data
    const totals = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fibreG: 0, sodiumMg: 0, sugarG: 0 };
    for (const line of r.ingredients) {
      const n = nutritionByName.get(line.name);
      if (!n) continue;
      const f = line.grams / 100;
      totals.calories += n.calories * f;
      totals.proteinG += n.proteinG * f;
      totals.carbsG += n.carbsG * f;
      totals.fatG += n.fatG * f;
      totals.fibreG += n.fibreG * f;
      totals.sodiumMg += n.sodiumMg * f;
      totals.sugarG += n.sugarG * f;
    }
    const perServing = Object.fromEntries(
      Object.entries(totals).map(([k, v]) => [k, Math.round((v / r.servings) * 10) / 10]),
    ) as typeof totals;

    await prisma.recipeNutrition.create({
      data: {
        recipeId: recipe.id,
        ...perServing,
        healthScore: healthScore(perServing),
      },
    });
    created++;
  }
  console.log(`✔ ${created} public recipes (of ${SEED_RECIPES.length})`);
}

async function seedDemoUser(ingredientIds: Map<string, string>) {
  const email = 'demo@smartgrocery.sg';
  const passwordHash = await bcrypt.hash('Demo1234!', 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: 'Demo User',
      passwordHash,
      emailVerifiedAt: new Date(),
      householdSize: 3,
      weeklyBudgetCents: 15000,
      preferredStores: ['FAIRPRICE', 'SHENG_SIONG', 'REDMART'],
      dietaryRestrictions: [],
      subscription: {
        create: { tier: 'PREMIUM', status: 'ACTIVE' },
      },
    },
  });

  const pantryCount = await prisma.pantryItem.count({ where: { userId: user.id } });
  if (pantryCount === 0) {
    const day = 24 * 60 * 60 * 1000;
    const items: Array<{ name: string; qty: number; unit: string; loc: 'PANTRY' | 'FRIDGE' | 'FREEZER'; expires: number | null }> = [
      { name: 'jasmine rice', qty: 2500, unit: 'g', loc: 'PANTRY', expires: 180 },
      { name: 'light soy sauce', qty: 400, unit: 'ml', loc: 'PANTRY', expires: 365 },
      { name: 'eggs', qty: 8, unit: 'piece', loc: 'FRIDGE', expires: 12 },
      { name: 'chicken thigh', qty: 500, unit: 'g', loc: 'FREEZER', expires: 60 },
      { name: 'kangkong', qty: 300, unit: 'g', loc: 'FRIDGE', expires: 3 },
      { name: 'firm tofu', qty: 300, unit: 'g', loc: 'FRIDGE', expires: 4 },
      { name: 'garlic', qty: 100, unit: 'g', loc: 'PANTRY', expires: 30 },
      { name: 'vegetable oil', qty: 1500, unit: 'ml', loc: 'PANTRY', expires: 240 },
    ];
    await prisma.pantryItem.createMany({
      data: items.map((i) => ({
        userId: user.id,
        ingredientId: ingredientIds.get(i.name) ?? null,
        name: i.name,
        quantity: i.qty,
        unit: i.unit,
        location: i.loc,
        expiresAt: i.expires ? new Date(Date.now() + i.expires * day) : null,
        purchasedAt: new Date(Date.now() - 2 * day),
        source: 'manual',
      })),
    });
  }
  console.log(`✔ demo user ${email} (password: Demo1234!) — PREMIUM`);
}

// ---------------------------------------------------------------------------

async function main() {
  console.log('Seeding Smart Grocery AI…');
  const storeIds = await seedStores();
  const ingredientIds = await seedIngredients();
  await seedSubstitutions(ingredientIds);
  await seedProducts(storeIds, ingredientIds);
  await seedRecipes(ingredientIds);
  await seedDemoUser(ingredientIds);
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
