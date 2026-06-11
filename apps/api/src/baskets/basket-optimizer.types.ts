import type { ProductDto, StoreCode } from '@smart-grocery/shared';

/** A normalized shopping requirement (one ingredient line). */
export interface Requirement {
  /** Stable key (ingredient id when known, otherwise a name-derived key). */
  key: string;
  ingredientId: string | null;
  name: string;
  /** Required canonical quantity in grams (or ml treated 1:1), null when unknown. */
  requiredQtyG: number | null;
}

/** One purchasable product offer satisfying a requirement. */
export interface Offer {
  productId: string;
  storeCode: StoreCode;
  storeName: string;
  /** Pack content in canonical grams (null for piece packs without gram info). */
  packQtyG: number | null;
  packIsPiece: boolean;
  priceCents: number;
  qualityTier: number;
  storeQualityScore: number;
  similarity: number;
  deliveryFeeCents: number;
  freeDeliveryMinCents: number | null;
  minOrderCents: number;
  /** Full DTO carried through so results can render product info. */
  product: ProductDto;
}

export interface OfferAssignment {
  offer: Offer;
  packs: number;
  costCents: number;
}
