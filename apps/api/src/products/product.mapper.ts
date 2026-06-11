import type { Price, Product, Store } from '@prisma/client';
import type { PriceDto, ProductDto } from '@smart-grocery/shared';
import { storeToDto } from '../stores/stores.service';

export function priceToDto(price: Price): PriceDto {
  return {
    priceCents: price.priceCents,
    wasPriceCents: price.wasPriceCents,
    isPromo: price.isPromo,
    promoEndsAt: price.promoEndsAt ? price.promoEndsAt.toISOString() : null,
    pricePerKgCents: price.pricePerKgCents,
    pricePerLCents: price.pricePerLCents,
    pricePerPieceCents: price.pricePerPieceCents,
    effectiveAt: price.effectiveAt.toISOString(),
  };
}

export function productToDto(
  product: Product & { store?: Store | null },
  latestPrice: Price | null | undefined,
): ProductDto {
  return {
    id: product.id,
    storeId: product.storeId,
    store: product.store ? storeToDto(product.store) : undefined,
    name: product.name,
    brand: product.brand,
    imageUrl: product.imageUrl,
    category: product.category,
    packSize: product.packSize,
    packUnit: product.packUnit,
    unitCount: product.unitCount,
    isAvailable: product.isAvailable,
    isOrganic: product.isOrganic,
    isHalal: product.isHalal,
    qualityTier: product.qualityTier,
    currentPrice: latestPrice ? priceToDto(latestPrice) : null,
  };
}
