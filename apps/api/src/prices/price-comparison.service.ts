import { Injectable } from '@nestjs/common';
import {
  packSizeToCanonical,
  PRODUCT_MATCH_MIN_SIMILARITY,
  type PriceComparisonRow,
} from '@smart-grocery/shared';
import { PrismaService } from '../prisma/prisma.service';
import { productToDto } from '../products/product.mapper';
import { PricesService } from './prices.service';

const MAX_OFFERS_PER_INGREDIENT = 6;

@Injectable()
export class PriceComparisonService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly prices: PricesService,
  ) {}

  async compare(ingredientIds: string[], requiredQtyG?: number): Promise<PriceComparisonRow[]> {
    const ingredients = await this.prisma.ingredient.findMany({
      where: { id: { in: ingredientIds } },
    });
    if (ingredients.length === 0) {
      return [];
    }

    const matches = await this.prisma.productIngredientMatch.findMany({
      where: {
        ingredientId: { in: ingredients.map((i) => i.id) },
        similarity: { gte: PRODUCT_MATCH_MIN_SIMILARITY },
        product: { isAvailable: true, store: { isActive: true } },
      },
      include: { product: { include: { store: true } } },
    });

    const priceMap = await this.prices.latestPriceMap(matches.map((m) => m.productId));

    const rows: PriceComparisonRow[] = [];
    for (const ingredient of ingredients) {
      const offers: PriceComparisonRow['offers'] = [];
      for (const match of matches) {
        if (match.ingredientId !== ingredient.id) {
          continue;
        }
        const price = priceMap.get(match.productId);
        if (!price) {
          continue;
        }
        const effectiveCostCents = this.effectiveCostCents(
          price.priceCents,
          match.product.packSize,
          match.product.packUnit,
          match.product.unitCount,
          requiredQtyG ?? null,
          ingredient.gramsPerPiece,
        );
        offers.push({
          product: productToDto(match.product, price),
          storeCode: match.product.store.code,
          storeName: match.product.store.name,
          effectiveCostCents,
          similarity: match.similarity,
        });
      }
      offers.sort((a, b) => a.effectiveCostCents - b.effectiveCostCents);
      rows.push({
        ingredientId: ingredient.id,
        ingredientName: ingredient.displayName,
        requiredQtyG: requiredQtyG ?? null,
        offers: offers.slice(0, MAX_OFFERS_PER_INGREDIENT),
      });
    }
    return rows;
  }

  /**
   * Cost to satisfy the required gram quantity with this product:
   * ceil(requiredQty / packCanonicalQty) * priceCents.
   * Piece-based packs use ingredient.gramsPerPiece when known; otherwise a
   * single pack is treated as satisfying the requirement.
   */
  private effectiveCostCents(
    priceCents: number,
    packSize: number,
    packUnit: string,
    unitCount: number,
    requiredQtyG: number | null,
    gramsPerPiece: number | null,
  ): number {
    if (requiredQtyG === null || requiredQtyG <= 0) {
      return priceCents;
    }
    const canonical = packSizeToCanonical(packSize, packUnit, unitCount);
    let packQtyG: number | null = null;
    if (canonical.unit === 'g' || canonical.unit === 'ml') {
      packQtyG = canonical.value;
    } else if (gramsPerPiece && gramsPerPiece > 0) {
      packQtyG = canonical.value * gramsPerPiece;
    }
    if (packQtyG === null || packQtyG <= 0) {
      // Piece pack without gram information: one pack satisfies the requirement.
      return priceCents;
    }
    const packs = Math.max(1, Math.ceil(requiredQtyG / packQtyG));
    return packs * priceCents;
  }
}
