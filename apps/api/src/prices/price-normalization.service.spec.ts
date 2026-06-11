import { PriceNormalizationService } from './price-normalization.service';

describe('PriceNormalizationService', () => {
  let service: PriceNormalizationService;

  beforeEach(() => {
    service = new PriceNormalizationService();
  });

  describe('mass packs', () => {
    it('normalizes a 500 G pack to price per kg', () => {
      const result = service.normalize(450, 500, 'G', 1);
      expect(result.pricePerKgCents).toBe(900);
      expect(result.pricePerLCents).toBeNull();
      expect(result.pricePerPieceCents).toBeNull();
    });

    it('normalizes a 1 KG pack to price per kg', () => {
      const result = service.normalize(1290, 1, 'KG', 1);
      expect(result.pricePerKgCents).toBe(1290);
    });

    it('normalizes a 2.5 KG pack to price per kg', () => {
      const result = service.normalize(1500, 2.5, 'KG', 1);
      expect(result.pricePerKgCents).toBe(600);
    });

    it('handles a multipack of 2 x 500 G', () => {
      const result = service.normalize(800, 500, 'G', 2);
      expect(result.pricePerKgCents).toBe(800);
    });

    it('rounds to the nearest cent', () => {
      const result = service.normalize(199, 300, 'G', 1);
      // 199 / 300 * 1000 = 663.33...
      expect(result.pricePerKgCents).toBe(663);
    });
  });

  describe('volume packs', () => {
    it('normalizes a 500 ML bottle to price per L', () => {
      const result = service.normalize(320, 500, 'ML', 1);
      expect(result.pricePerLCents).toBe(640);
      expect(result.pricePerKgCents).toBeNull();
      expect(result.pricePerPieceCents).toBeNull();
    });

    it('normalizes a 1 L bottle to price per L', () => {
      const result = service.normalize(645, 1, 'L', 1);
      expect(result.pricePerLCents).toBe(645);
    });

    it('handles a multipack of 6 x 250 ML', () => {
      const result = service.normalize(900, 250, 'ML', 6);
      // 1500 ml total -> 900 / 1500 * 1000 = 600
      expect(result.pricePerLCents).toBe(600);
    });
  });

  describe('piece packs', () => {
    it('normalizes a 10 PIECE pack to price per piece', () => {
      const result = service.normalize(330, 10, 'PIECE', 1);
      expect(result.pricePerPieceCents).toBe(33);
      expect(result.pricePerKgCents).toBeNull();
      expect(result.pricePerLCents).toBeNull();
    });

    it('handles multipack pieces (2 x 6 pieces)', () => {
      const result = service.normalize(600, 6, 'PIECE', 2);
      expect(result.pricePerPieceCents).toBe(50);
    });

    it('treats a single piece pack as the per-piece price', () => {
      const result = service.normalize(250, 1, 'PIECE', 1);
      expect(result.pricePerPieceCents).toBe(250);
    });
  });

  describe('PACK unit', () => {
    it('normalizes PACK via the shared canonical conversion (defaults to grams)', () => {
      // shared packSizeToCanonical maps "pack" through the count-unit default of 200 g
      const result = service.normalize(400, 1, 'PACK', 1);
      expect(result.pricePerKgCents).toBe(2000);
    });
  });

  describe('edge cases', () => {
    it('returns nulls for zero price', () => {
      const result = service.normalize(0, 500, 'G', 1);
      expect(result).toEqual({
        pricePerKgCents: null,
        pricePerLCents: null,
        pricePerPieceCents: null,
      });
    });

    it('returns nulls for zero pack size', () => {
      const result = service.normalize(500, 0, 'G', 1);
      expect(result).toEqual({
        pricePerKgCents: null,
        pricePerLCents: null,
        pricePerPieceCents: null,
      });
    });

    it('treats non-positive unitCount as 1', () => {
      const result = service.normalize(450, 500, 'G', 0);
      expect(result.pricePerKgCents).toBe(900);
    });

    it('returns nulls for negative price', () => {
      const result = service.normalize(-100, 500, 'G', 1);
      expect(result.pricePerKgCents).toBeNull();
    });
  });
});
