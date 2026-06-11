import type { StoreCode } from './types';

export const STORE_INFO: Record<
  StoreCode,
  { name: string; deliveryFeeCents: number; freeDeliveryMinCents: number | null; minOrderCents: number; qualityScore: number; supportsDelivery: boolean }
> = {
  FAIRPRICE: { name: 'FairPrice', deliveryFeeCents: 399, freeDeliveryMinCents: 5900, minOrderCents: 0, qualityScore: 3.8, supportsDelivery: true },
  SHENG_SIONG: { name: 'Sheng Siong', deliveryFeeCents: 600, freeDeliveryMinCents: 10000, minOrderCents: 3000, qualityScore: 3.5, supportsDelivery: true },
  GIANT: { name: 'Giant', deliveryFeeCents: 700, freeDeliveryMinCents: 6000, minOrderCents: 0, qualityScore: 3.4, supportsDelivery: true },
  COLD_STORAGE: { name: 'Cold Storage', deliveryFeeCents: 700, freeDeliveryMinCents: 8000, minOrderCents: 0, qualityScore: 4.3, supportsDelivery: true },
  PRIME: { name: 'Prime Supermarket', deliveryFeeCents: 500, freeDeliveryMinCents: 8800, minOrderCents: 2000, qualityScore: 3.4, supportsDelivery: true },
  REDMART: { name: 'RedMart', deliveryFeeCents: 299, freeDeliveryMinCents: 4000, minOrderCents: 2000, qualityScore: 4.0, supportsDelivery: true },
  AMAZON_FRESH: { name: 'Amazon Fresh', deliveryFeeCents: 599, freeDeliveryMinCents: 6000, minOrderCents: 0, qualityScore: 4.0, supportsDelivery: true },
};

export const FREE_TIER_LIMITS = {
  recipeScansPerMonth: 5,
  basketOptimizationsPerDay: 1,
  aiChatMessagesPerDay: 10,
  pantryItemsMax: 50,
  mealPlanning: false,
  priceForecasting: false,
  alerts: false,
} as const;

export const PREMIUM_PRICE = {
  monthlyCentsSGD: 790,
  yearlyCentsSGD: 7900,
} as const;

export const DIETARY_RESTRICTIONS = [
  'halal',
  'vegetarian',
  'vegan',
  'pescatarian',
  'gluten-free',
  'dairy-free',
  'nut-free',
  'low-carb',
  'low-sodium',
  'diabetic-friendly',
] as const;

export const PRODUCT_MATCH_MIN_SIMILARITY = 0.45;
export const PRODUCT_MATCH_GOOD_SIMILARITY = 0.62;

export function formatSGD(cents: number): string {
  return new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' }).format(cents / 100);
}
