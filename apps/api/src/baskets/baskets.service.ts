import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BasketStatus, Prisma } from '@prisma/client';
import type { Basket, BasketItem, Price, Product, Store } from '@prisma/client';
import {
  packSizeToCanonical,
  toCanonical,
  PRODUCT_MATCH_MIN_SIMILARITY,
  type BasketDto,
  type BasketItemDto,
  type OptimizationResult,
  type OptimizeBasketInput,
  type Paginated,
} from '@smart-grocery/shared';
import type { AuthUser } from '../auth/types';
import { PrismaService } from '../prisma/prisma.service';
import { PricesService } from '../prices/prices.service';
import { productToDto } from '../products/products.service';
import { BasketOptimizerService } from './basket-optimizer.service';
import type { Offer, Requirement } from './basket-optimizer.types';

interface IngredientLookupRow {
  id: string;
  displayName: string;
  sim: number;
}

export interface PreparedBasket {
  requirements: Requirement[];
  offersByReq: Map<string, Offer[]>;
}

export interface SaveBasketInput {
  name: string;
  strategy: 'CHEAPEST' | 'CONVENIENCE' | 'DELIVERY' | 'QUALITY';
  recipeId?: string;
  result: OptimizationResult;
}

type BasketWithItems = Basket & {
  items: Array<BasketItem & { product: (Product & { store: Store }) | null }>;
};

@Injectable()
export class BasketsService {
  private readonly logger = new Logger(BasketsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly prices: PricesService,
    private readonly optimizer: BasketOptimizerService,
  ) {}

  // =====================================================================
  // Optimization input preparation
  // =====================================================================

  async prepareRequirements(user: AuthUser, input: OptimizeBasketInput): Promise<PreparedBasket> {
    if (!input.recipeId && (!input.ingredientNames || input.ingredientNames.length === 0)) {
      throw new BadRequestException('Provide a recipeId and/or ingredientNames');
    }

    const requirements = new Map<string, Requirement>();

    if (input.recipeId) {
      await this.addRecipeRequirements(user, input.recipeId, input.servingsMultiplier, requirements);
    }
    if (input.ingredientNames) {
      await this.addNamedRequirements(input.ingredientNames, requirements);
    }

    let reqs = [...requirements.values()];
    if (input.usePantry) {
      reqs = await this.subtractPantry(user, reqs);
    }

    const offersByReq = await this.buildOffers(reqs, input.excludeStores ?? []);
    return { requirements: reqs, offersByReq };
  }

  private async addRecipeRequirements(
    user: AuthUser,
    recipeId: string,
    servingsMultiplier: number,
    out: Map<string, Requirement>,
  ): Promise<void> {
    const recipe = await this.prisma.recipe.findFirst({
      where: { id: recipeId, deletedAt: null, OR: [{ userId: user.id }, { isPublic: true }] },
      include: { ingredients: { include: { ingredient: true }, orderBy: { sortOrder: 'asc' } } },
    });
    if (!recipe) {
      throw new NotFoundException(`Recipe ${recipeId} not found`);
    }
    for (const line of recipe.ingredients) {
      const key = line.ingredientId ?? `raw:${line.rawText.trim().toLowerCase()}`;
      const qty =
        line.normalizedQtyG !== null && line.normalizedQtyG > 0
          ? line.normalizedQtyG * servingsMultiplier
          : null;
      const existing = out.get(key);
      if (existing) {
        if (existing.requiredQtyG !== null && qty !== null) {
          existing.requiredQtyG += qty;
        } else if (qty !== null) {
          existing.requiredQtyG = qty;
        }
      } else {
        out.set(key, {
          key,
          ingredientId: line.ingredientId,
          name: line.ingredient?.displayName ?? line.rawText.trim(),
          requiredQtyG: qty,
        });
      }
    }
  }

  private async addNamedRequirements(
    names: string[],
    out: Map<string, Requirement>,
  ): Promise<void> {
    for (const rawName of names) {
      const name = rawName.trim();
      if (!name) {
        continue;
      }
      const ingredient = await this.lookupIngredient(name);
      const key = ingredient ? ingredient.id : `raw:${name.toLowerCase()}`;
      if (!out.has(key)) {
        out.set(key, {
          key,
          ingredientId: ingredient?.id ?? null,
          name: ingredient?.displayName ?? name,
          requiredQtyG: null,
        });
      }
    }
  }

  /** Exact name/alias lookup, falling back to trigram similarity (> 0.3). */
  private async lookupIngredient(
    name: string,
  ): Promise<{ id: string; displayName: string } | null> {
    const lower = name.toLowerCase();
    const exact = await this.prisma.ingredient.findFirst({
      where: {
        OR: [{ name: lower }, { aliases: { some: { alias: lower } } }],
      },
      select: { id: true, displayName: true },
    });
    if (exact) {
      return exact;
    }
    const rows = await this.prisma.$queryRaw<IngredientLookupRow[]>(Prisma.sql`
      SELECT i.id::text AS id, i."displayName" AS "displayName",
             GREATEST(
               similarity(lower(i.name), ${lower}),
               similarity(lower(i."displayName"), ${lower}),
               COALESCE((
                 SELECT max(similarity(lower(a.alias), ${lower}))
                 FROM ingredient_aliases a
                 WHERE a."ingredientId" = i.id
               ), 0)
             )::float AS sim
      FROM ingredients i
      ORDER BY sim DESC
      LIMIT 1
    `);
    if (rows.length > 0 && rows[0].sim > 0.3) {
      return { id: rows[0].id, displayName: rows[0].displayName };
    }
    return null;
  }

  /** Subtract unconsumed pantry stock from gram-quantified requirements. */
  private async subtractPantry(user: AuthUser, reqs: Requirement[]): Promise<Requirement[]> {
    const ingredientIds = reqs.map((r) => r.ingredientId).filter((id): id is string => id !== null);
    if (ingredientIds.length === 0) {
      return reqs;
    }
    const pantryItems = await this.prisma.pantryItem.findMany({
      where: {
        userId: user.id,
        consumedAt: null,
        wasted: false,
        ingredientId: { in: ingredientIds },
      },
      include: { ingredient: true },
    });

    const pantryGrams = new Map<string, number>();
    for (const item of pantryItems) {
      if (!item.ingredientId) {
        continue;
      }
      const canonical = toCanonical(item.quantity, item.unit, {
        density: item.ingredient?.density,
        gramsPerPiece: item.ingredient?.gramsPerPiece,
      });
      if (canonical.unit === 'g' || canonical.unit === 'ml') {
        pantryGrams.set(
          item.ingredientId,
          (pantryGrams.get(item.ingredientId) ?? 0) + canonical.value,
        );
      }
    }

    const remaining: Requirement[] = [];
    for (const r of reqs) {
      if (r.ingredientId === null || r.requiredQtyG === null) {
        remaining.push(r);
        continue;
      }
      const inPantry = pantryGrams.get(r.ingredientId) ?? 0;
      if (inPantry <= 0) {
        remaining.push(r);
        continue;
      }
      const needed = r.requiredQtyG - inPantry;
      if (needed > 0.5) {
        remaining.push({ ...r, requiredQtyG: needed });
      }
      // else fully covered by pantry: drop the requirement
    }
    return remaining;
  }

  private async buildOffers(
    reqs: Requirement[],
    excludeStores: string[],
  ): Promise<Map<string, Offer[]>> {
    const offersByReq = new Map<string, Offer[]>();
    const ingredientIds = reqs.map((r) => r.ingredientId).filter((id): id is string => id !== null);
    if (ingredientIds.length === 0) {
      return offersByReq;
    }
    const excluded = new Set(excludeStores.map((s) => s.toUpperCase()));

    const matches = await this.prisma.productIngredientMatch.findMany({
      where: {
        ingredientId: { in: ingredientIds },
        similarity: { gte: PRODUCT_MATCH_MIN_SIMILARITY },
        product: { isAvailable: true, store: { isActive: true } },
      },
      include: { product: { include: { store: true } }, ingredient: true },
    });
    const filtered = matches.filter((m) => !excluded.has(m.product.store.code));
    const priceMap = await this.prices.latestPriceMap(filtered.map((m) => m.productId));

    const byIngredient = new Map<string, Offer[]>();
    for (const match of filtered) {
      const price = priceMap.get(match.productId);
      if (!price) {
        continue;
      }
      const offer = this.toOffer(match.product, match.ingredient.gramsPerPiece, price, match.similarity);
      const list = byIngredient.get(match.ingredientId) ?? [];
      list.push(offer);
      byIngredient.set(match.ingredientId, list);
    }

    for (const r of reqs) {
      if (r.ingredientId) {
        const offers = byIngredient.get(r.ingredientId);
        if (offers && offers.length > 0) {
          offersByReq.set(r.key, offers);
        }
      }
    }
    return offersByReq;
  }

  private toOffer(
    product: Product & { store: Store },
    gramsPerPiece: number | null,
    price: Price,
    similarity: number,
  ): Offer {
    const canonical = packSizeToCanonical(product.packSize, product.packUnit, product.unitCount);
    let packQtyG: number | null = null;
    let packIsPiece = false;
    if (canonical.unit === 'g' || canonical.unit === 'ml') {
      packQtyG = canonical.value;
    } else {
      packIsPiece = true;
      if (gramsPerPiece && gramsPerPiece > 0) {
        packQtyG = canonical.value * gramsPerPiece;
      }
    }
    return {
      productId: product.id,
      storeCode: product.store.code,
      storeName: product.store.name,
      packQtyG,
      packIsPiece,
      priceCents: price.priceCents,
      qualityTier: product.qualityTier,
      storeQualityScore: product.store.qualityScore,
      similarity,
      deliveryFeeCents: product.store.deliveryFeeCents,
      freeDeliveryMinCents: product.store.freeDeliveryMinCents,
      minOrderCents: product.store.minOrderCents,
      product: productToDto(product, price),
    };
  }

  async optimize(
    user: AuthUser,
    input: OptimizeBasketInput,
  ): Promise<{ results: OptimizationResult[]; requirements: Requirement[] }> {
    const { requirements, offersByReq } = await this.prepareRequirements(user, input);
    const results = this.optimizer.optimizeAll(requirements, offersByReq);
    return { results, requirements };
  }

  // =====================================================================
  // Persistence
  // =====================================================================

  async saveBasket(user: AuthUser, input: SaveBasketInput): Promise<BasketDto> {
    const { result } = input;

    // Null out product references that no longer exist to satisfy the FK.
    const productIds = result.items
      .map((i) => i.product?.id)
      .filter((id): id is string => typeof id === 'string');
    const existing = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true },
    });
    const validIds = new Set(existing.map((p) => p.id));

    const basket = await this.prisma.basket.create({
      data: {
        userId: user.id,
        recipeId: input.recipeId ?? null,
        name: input.name,
        strategy: input.strategy,
        status: BasketStatus.OPTIMIZED,
        totalCents: result.totalCents,
        deliveryCents: result.deliveryCents,
        storeCount: result.storeCount,
        savingsCents: result.savingsCents,
        optimizationMeta: {
          grandTotalCents: result.grandTotalCents,
          storeBreakdown: result.storeBreakdown,
          unmatchedIngredients: result.unmatchedIngredients,
        } as unknown as Prisma.InputJsonValue,
        items: {
          create: result.items.map((item) => ({
            productId: item.product && validIds.has(item.product.id) ? item.product.id : null,
            ingredientName: item.ingredientName,
            requiredQtyG: item.requiredQtyG,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
            totalCents: item.totalCents,
            isSubstitute: item.isSubstitute,
            unmatched: item.unmatched,
          })),
        },
      },
      include: { items: { include: { product: { include: { store: true } } } } },
    });

    this.logger.log(`Basket ${basket.id} saved for user ${user.id} (${input.strategy})`);
    return this.toDto(basket);
  }

  async listMine(user: AuthUser, page: number, pageSize: number): Promise<Paginated<BasketDto>> {
    const [baskets, total] = await this.prisma.$transaction([
      this.prisma.basket.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { items: { include: { product: { include: { store: true } } } } },
      }),
      this.prisma.basket.count({ where: { userId: user.id } }),
    ]);
    return {
      items: baskets.map((b) => this.toDto(b)),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async getOwn(user: AuthUser, id: string): Promise<BasketDto> {
    const basket = await this.requireOwn(user, id);
    return this.toDto(basket);
  }

  async updateStatus(user: AuthUser, id: string, status: BasketStatus): Promise<BasketDto> {
    await this.requireOwn(user, id);
    const basket = await this.prisma.basket.update({
      where: { id },
      data: { status },
      include: { items: { include: { product: { include: { store: true } } } } },
    });
    return this.toDto(basket);
  }

  async updateItemChecked(
    user: AuthUser,
    basketId: string,
    itemId: string,
    checked: boolean,
  ): Promise<BasketItemDto> {
    await this.requireOwn(user, basketId);
    const item = await this.prisma.basketItem.findFirst({
      where: { id: itemId, basketId },
    });
    if (!item) {
      throw new NotFoundException(`Basket item ${itemId} not found`);
    }
    const updated = await this.prisma.basketItem.update({
      where: { id: itemId },
      data: { checked },
      include: { product: { include: { store: true } } },
    });
    return this.itemToDto(updated);
  }

  async deleteBasket(user: AuthUser, id: string): Promise<void> {
    await this.requireOwn(user, id);
    await this.prisma.basket.delete({ where: { id } });
  }

  private async requireOwn(user: AuthUser, id: string): Promise<BasketWithItems> {
    const basket = await this.prisma.basket.findFirst({
      where: { id, userId: user.id },
      include: { items: { include: { product: { include: { store: true } } } } },
    });
    if (!basket) {
      throw new NotFoundException(`Basket ${id} not found`);
    }
    return basket;
  }

  private toDto(basket: BasketWithItems): BasketDto {
    return {
      id: basket.id,
      name: basket.name,
      strategy: basket.strategy,
      status: basket.status,
      totalCents: basket.totalCents,
      deliveryCents: basket.deliveryCents,
      storeCount: basket.storeCount,
      savingsCents: basket.savingsCents,
      recipeId: basket.recipeId,
      items: basket.items.map((item) => this.itemToDto(item)),
      createdAt: basket.createdAt.toISOString(),
    };
  }

  private itemToDto(
    item: BasketItem & { product: (Product & { store: Store }) | null },
  ): BasketItemDto {
    return {
      id: item.id,
      ingredientName: item.ingredientName,
      requiredQtyG: item.requiredQtyG,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      totalCents: item.totalCents,
      isSubstitute: item.isSubstitute,
      unmatched: item.unmatched,
      checked: item.checked,
      product: item.product ? productToDto(item.product, null) : null,
    };
  }
}
