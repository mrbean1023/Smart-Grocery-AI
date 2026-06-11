import type { ProductDto, StoreCode } from '@smart-grocery/shared';
import { BasketOptimizerService } from './basket-optimizer.service';
import type { Offer, Requirement } from './basket-optimizer.types';

// ---- fixture helpers ----

const STORES: Record<
  'FAIRPRICE' | 'SHENG_SIONG' | 'COLD_STORAGE',
  {
    storeName: string;
    deliveryFeeCents: number;
    freeDeliveryMinCents: number;
    qualityScore: number;
    tier: number;
  }
> = {
  FAIRPRICE: {
    storeName: 'FairPrice',
    deliveryFeeCents: 399,
    freeDeliveryMinCents: 5900,
    qualityScore: 3.8,
    tier: 2,
  },
  SHENG_SIONG: {
    storeName: 'Sheng Siong',
    deliveryFeeCents: 600,
    freeDeliveryMinCents: 10000,
    qualityScore: 3.5,
    tier: 1,
  },
  COLD_STORAGE: {
    storeName: 'Cold Storage',
    deliveryFeeCents: 700,
    freeDeliveryMinCents: 8000,
    qualityScore: 4.3,
    tier: 3,
  },
};

let offerSeq = 0;

function makeOffer(
  store: keyof typeof STORES,
  packQtyG: number | null,
  priceCents: number,
  overrides: Partial<Offer> = {},
): Offer {
  const s = STORES[store];
  const productId = `product-${++offerSeq}`;
  const product: ProductDto = {
    id: productId,
    storeId: `store-${store}`,
    name: `Product ${offerSeq}`,
    brand: null,
    imageUrl: null,
    category: null,
    packSize: packQtyG ?? 1,
    packUnit: packQtyG === null ? 'PIECE' : 'G',
    unitCount: 1,
    isAvailable: true,
    isOrganic: false,
    isHalal: false,
    qualityTier: s.tier,
    currentPrice: null,
  };
  return {
    productId,
    storeCode: store as StoreCode,
    storeName: s.storeName,
    packQtyG,
    packIsPiece: packQtyG === null,
    priceCents,
    qualityTier: s.tier,
    storeQualityScore: s.qualityScore,
    similarity: 0.9,
    deliveryFeeCents: s.deliveryFeeCents,
    freeDeliveryMinCents: s.freeDeliveryMinCents,
    minOrderCents: 0,
    product,
    ...overrides,
  };
}

function req(key: string, name: string, requiredQtyG: number | null): Requirement {
  return { key, ingredientId: key, name, requiredQtyG };
}

/**
 * Fixture: 5 ingredients x 3 stores.
 * rice (1000 g), chicken (500 g), kangkong (300 g), soy sauce (qty unknown),
 * saffron (no offers anywhere).
 */
function buildFixture(): { requirements: Requirement[]; offersByReq: Map<string, Offer[]> } {
  const requirements = [
    req('rice', 'Jasmine Rice', 1000),
    req('chicken', 'Chicken Breast', 500),
    req('kangkong', 'Kangkong', 300),
    req('soy', 'Light Soy Sauce', null),
    req('saffron', 'Saffron', 5),
  ];
  const offersByReq = new Map<string, Offer[]>([
    [
      'rice',
      [
        makeOffer('FAIRPRICE', 1000, 300),
        makeOffer('SHENG_SIONG', 500, 140), // 2 packs => 280 (cheapest)
        makeOffer('COLD_STORAGE', 1000, 420),
      ],
    ],
    [
      'chicken',
      [
        makeOffer('FAIRPRICE', 500, 450),
        makeOffer('SHENG_SIONG', 500, 430),
        makeOffer('COLD_STORAGE', 500, 600),
      ],
    ],
    [
      'kangkong',
      [
        makeOffer('FAIRPRICE', 250, 120), // 2 packs => 240
        makeOffer('SHENG_SIONG', 300, 100),
        makeOffer('COLD_STORAGE', 300, 180),
      ],
    ],
    [
      'soy',
      [
        makeOffer('FAIRPRICE', 500, 320),
        makeOffer('SHENG_SIONG', 640, 350),
        makeOffer('COLD_STORAGE', 500, 500),
      ],
    ],
    // saffron: no offers
  ]);
  return { requirements, offersByReq };
}

describe('BasketOptimizerService', () => {
  let optimizer: BasketOptimizerService;

  beforeEach(() => {
    optimizer = new BasketOptimizerService();
  });

  describe('packsNeeded', () => {
    const r = req('x', 'X', 750);

    it('rounds packs up', () => {
      expect(optimizer.packsNeeded(r, makeOffer('FAIRPRICE', 500, 100))).toBe(2);
    });

    it('returns at least 1 pack', () => {
      expect(optimizer.packsNeeded(r, makeOffer('FAIRPRICE', 2000, 100))).toBe(1);
    });

    it('uses 1 pack for piece packs without gram info', () => {
      expect(optimizer.packsNeeded(r, makeOffer('FAIRPRICE', null, 100))).toBe(1);
    });

    it('uses 1 pack when the required quantity is unknown', () => {
      expect(optimizer.packsNeeded(req('y', 'Y', null), makeOffer('FAIRPRICE', 500, 100))).toBe(1);
    });
  });

  describe('CHEAPEST', () => {
    it('picks the minimum effective cost per requirement', () => {
      const { requirements, offersByReq } = buildFixture();
      const result = optimizer.optimize(requirements, offersByReq, 'CHEAPEST');

      // rice SS 280, chicken SS 430, kangkong SS 100, soy FP 320
      expect(result.totalCents).toBe(280 + 430 + 100 + 320);
      expect(result.storeCount).toBe(2);
      // SS subtotal 810 < 10000 => 600; FP subtotal 320 < 5900 => 399
      expect(result.deliveryCents).toBe(600 + 399);
      expect(result.grandTotalCents).toBe(1130 + 999);

      const riceItem = result.items.find((i) => i.ingredientName === 'Jasmine Rice');
      expect(riceItem).toBeDefined();
      expect(riceItem!.quantity).toBe(2); // 2 x 500 g packs
      expect(riceItem!.unitPriceCents).toBe(140);
      expect(riceItem!.totalCents).toBe(280);
      expect(riceItem!.isSubstitute).toBe(false);
    });
  });

  describe('CONVENIENCE', () => {
    it('consolidates into a single store when one covers everything', () => {
      const { requirements, offersByReq } = buildFixture();
      const result = optimizer.optimize(requirements, offersByReq, 'CONVENIENCE');

      expect(result.storeCount).toBe(1);
      expect(result.storeBreakdown[0].storeCode).toBe('SHENG_SIONG');
      // SS: rice 280 + chicken 430 + kangkong 100 + soy 350
      expect(result.totalCents).toBe(1160);
      expect(result.deliveryCents).toBe(600);
      expect(result.grandTotalCents).toBe(1760);
    });

    it('selects multiple stores only when no single store covers all', () => {
      const requirements = [req('a', 'A', 100), req('b', 'B', 100)];
      const offersByReq = new Map<string, Offer[]>([
        ['a', [makeOffer('FAIRPRICE', 100, 200)]],
        ['b', [makeOffer('SHENG_SIONG', 100, 300)]],
      ]);
      const result = optimizer.optimize(requirements, offersByReq, 'CONVENIENCE');
      expect(result.storeCount).toBe(2);
      expect(result.unmatchedIngredients).toEqual([]);
    });
  });

  describe('DELIVERY', () => {
    it('minimizes grand total including delivery fees', () => {
      const { requirements, offersByReq } = buildFixture();
      const result = optimizer.optimize(requirements, offersByReq, 'DELIVERY');

      // FP full coverage: 300+450+240+320 = 1310 + 399 = 1709 beats SS 1760 and CS 2400
      expect(result.storeCount).toBe(1);
      expect(result.storeBreakdown[0].storeCode).toBe('FAIRPRICE');
      expect(result.totalCents).toBe(1310);
      expect(result.deliveryCents).toBe(399);
      expect(result.grandTotalCents).toBe(1709);
    });

    it('waives the delivery fee above the free-delivery minimum', () => {
      const requirements = [req('rice', 'Jasmine Rice', 20000)];
      const offersByReq = new Map<string, Offer[]>([
        [
          'rice',
          [
            makeOffer('FAIRPRICE', 1000, 300), // 20 packs = 6000 >= 5900 => free delivery
            makeOffer('SHENG_SIONG', 500, 140), // 40 packs = 5600 + 600 = 6200
          ],
        ],
      ]);
      const result = optimizer.optimize(requirements, offersByReq, 'DELIVERY');
      expect(result.storeBreakdown[0].storeCode).toBe('FAIRPRICE');
      expect(result.deliveryCents).toBe(0);
      expect(result.grandTotalCents).toBe(6000);

      // CHEAPEST ignores delivery and picks Sheng Siong instead
      const cheapest = optimizer.optimize(requirements, offersByReq, 'CHEAPEST');
      expect(cheapest.storeBreakdown[0].storeCode).toBe('SHENG_SIONG');
      expect(cheapest.grandTotalCents).toBe(6200);
    });

    it('fills uncovered requirements from a single complementary store (max 2 stores)', () => {
      const requirements = [
        req('a', 'A', 100),
        req('b', 'B', 100),
        req('c', 'C', 100),
        req('d', 'D', 100),
      ];
      const offersByReq = new Map<string, Offer[]>([
        ['a', [makeOffer('FAIRPRICE', 100, 100), makeOffer('COLD_STORAGE', 100, 150)]],
        ['b', [makeOffer('FAIRPRICE', 100, 100), makeOffer('COLD_STORAGE', 100, 150)]],
        ['c', [makeOffer('FAIRPRICE', 100, 100)]],
        ['d', [makeOffer('SHENG_SIONG', 100, 100), makeOffer('COLD_STORAGE', 100, 120)]],
      ]);
      const result = optimizer.optimize(requirements, offersByReq, 'DELIVERY');
      // FP covers a,b,c (75% >= 60%); d filled from one complementary store.
      expect(result.storeCount).toBeLessThanOrEqual(2);
      expect(result.unmatchedIngredients).toEqual([]);
      expect(result.items.filter((i) => !i.unmatched)).toHaveLength(4);
    });
  });

  describe('QUALITY', () => {
    it('maximizes qualityTier*2 + storeQualityScore per requirement', () => {
      const { requirements, offersByReq } = buildFixture();
      const result = optimizer.optimize(requirements, offersByReq, 'QUALITY');

      // Cold Storage (tier 3, 4.3) wins every requirement: 420+600+180+500
      expect(result.storeCount).toBe(1);
      expect(result.storeBreakdown[0].storeCode).toBe('COLD_STORAGE');
      expect(result.totalCents).toBe(1700);
      expect(result.deliveryCents).toBe(700);
      expect(result.grandTotalCents).toBe(2400);
    });

    it('breaks quality ties by lowest effective cost', () => {
      const requirements = [req('a', 'A', 100)];
      const expensive = makeOffer('FAIRPRICE', 100, 500, { qualityTier: 2 });
      const cheap = makeOffer('FAIRPRICE', 100, 300, { qualityTier: 2 });
      const offersByReq = new Map<string, Offer[]>([['a', [expensive, cheap]]]);
      const result = optimizer.optimize(requirements, offersByReq, 'QUALITY');
      expect(result.totalCents).toBe(300);
    });
  });

  describe('savings and baseline', () => {
    it('computes savings against the mean single-store baseline and never negative', () => {
      const { requirements, offersByReq } = buildFixture();
      const results = optimizer.optimizeAll(requirements, offersByReq);

      // baseline = mean(FP 1709, SS 1760, CS 2400) = 1956.33
      const byStrategy = new Map(results.map((r) => [r.strategy, r]));
      expect(byStrategy.get('DELIVERY')!.savingsCents).toBe(247); // 1956.33 - 1709
      expect(byStrategy.get('CONVENIENCE')!.savingsCents).toBe(196); // 1956.33 - 1760
      expect(byStrategy.get('CHEAPEST')!.savingsCents).toBe(0); // grand 2129 > baseline
      expect(byStrategy.get('QUALITY')!.savingsCents).toBe(0); // grand 2400 > baseline

      for (const result of results) {
        expect(result.savingsCents).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('optimizeAll', () => {
    it('returns all four strategies', () => {
      const { requirements, offersByReq } = buildFixture();
      const results = optimizer.optimizeAll(requirements, offersByReq);
      expect(results.map((r) => r.strategy)).toEqual([
        'CHEAPEST',
        'CONVENIENCE',
        'DELIVERY',
        'QUALITY',
      ]);
    });

    it('tracks unmatched ingredients in every strategy', () => {
      const { requirements, offersByReq } = buildFixture();
      for (const result of optimizer.optimizeAll(requirements, offersByReq)) {
        expect(result.unmatchedIngredients).toEqual(['Saffron']);
        const unmatchedItem = result.items.find((i) => i.unmatched);
        expect(unmatchedItem).toBeDefined();
        expect(unmatchedItem!.ingredientName).toBe('Saffron');
        expect(unmatchedItem!.product).toBeNull();
        expect(unmatchedItem!.totalCents).toBe(0);
        expect(result.items).toHaveLength(5);
      }
    });

    it('handles an empty requirement list', () => {
      const results = optimizer.optimizeAll([], new Map());
      for (const result of results) {
        expect(result.totalCents).toBe(0);
        expect(result.grandTotalCents).toBe(0);
        expect(result.storeCount).toBe(0);
        expect(result.items).toEqual([]);
        expect(result.unmatchedIngredients).toEqual([]);
        expect(result.savingsCents).toBe(0);
      }
    });

    it('handles all-unmatched requirements', () => {
      const requirements = [req('x', 'Dragon fruit powder', 100)];
      const results = optimizer.optimizeAll(requirements, new Map());
      for (const result of results) {
        expect(result.unmatchedIngredients).toEqual(['Dragon fruit powder']);
        expect(result.grandTotalCents).toBe(0);
      }
    });
  });
});
