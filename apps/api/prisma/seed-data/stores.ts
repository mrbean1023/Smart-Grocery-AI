/** Seven Singapore grocery retailers with realistic delivery economics. */

export type SeedStoreCode =
  | 'FAIRPRICE'
  | 'SHENG_SIONG'
  | 'GIANT'
  | 'COLD_STORAGE'
  | 'PRIME'
  | 'REDMART'
  | 'AMAZON_FRESH';

export interface SeedStore {
  code: SeedStoreCode;
  name: string;
  websiteUrl: string;
  supportsDelivery: boolean;
  deliveryFeeCents: number;
  freeDeliveryMinCents: number | null;
  minOrderCents: number;
  avgDeliveryDays: number;
  qualityScore: number;
}

export const SEED_STORES: SeedStore[] = [
  {
    code: 'FAIRPRICE',
    name: 'FairPrice',
    websiteUrl: 'https://www.fairprice.com.sg',
    supportsDelivery: true,
    deliveryFeeCents: 399,
    freeDeliveryMinCents: 5900,
    minOrderCents: 0,
    avgDeliveryDays: 1,
    qualityScore: 3.8,
  },
  {
    code: 'SHENG_SIONG',
    name: 'Sheng Siong',
    websiteUrl: 'https://www.allforyou.sg',
    supportsDelivery: true,
    deliveryFeeCents: 600,
    freeDeliveryMinCents: 10000,
    minOrderCents: 3000,
    avgDeliveryDays: 1.5,
    qualityScore: 3.5,
  },
  {
    code: 'GIANT',
    name: 'Giant',
    websiteUrl: 'https://giant.sg',
    supportsDelivery: true,
    deliveryFeeCents: 700,
    freeDeliveryMinCents: 6000,
    minOrderCents: 0,
    avgDeliveryDays: 1.5,
    qualityScore: 3.4,
  },
  {
    code: 'COLD_STORAGE',
    name: 'Cold Storage',
    websiteUrl: 'https://coldstorage.com.sg',
    supportsDelivery: true,
    deliveryFeeCents: 700,
    freeDeliveryMinCents: 8000,
    minOrderCents: 0,
    avgDeliveryDays: 1,
    qualityScore: 4.3,
  },
  {
    code: 'PRIME',
    name: 'Prime Supermarket',
    websiteUrl: 'https://www.primesupermarket.com',
    supportsDelivery: true,
    deliveryFeeCents: 500,
    freeDeliveryMinCents: 8800,
    minOrderCents: 2000,
    avgDeliveryDays: 2,
    qualityScore: 3.4,
  },
  {
    code: 'REDMART',
    name: 'RedMart',
    websiteUrl: 'https://www.lazada.sg/redmart',
    supportsDelivery: true,
    deliveryFeeCents: 299,
    freeDeliveryMinCents: 4000,
    minOrderCents: 2000,
    avgDeliveryDays: 1,
    qualityScore: 4.0,
  },
  {
    code: 'AMAZON_FRESH',
    name: 'Amazon Fresh',
    websiteUrl: 'https://www.amazon.sg/fresh',
    supportsDelivery: true,
    deliveryFeeCents: 599,
    freeDeliveryMinCents: 6000,
    minOrderCents: 0,
    avgDeliveryDays: 0.5,
    qualityScore: 4.0,
  },
];
