import { Injectable } from '@nestjs/common';
import { packSizeToCanonical } from '@smart-grocery/shared';

export interface NormalizedPrices {
  pricePerKgCents: number | null;
  pricePerLCents: number | null;
  pricePerPieceCents: number | null;
}

/**
 * Computes normalized unit prices (per kg / per L / per piece) for a price
 * point, given the product's pack configuration.
 */
@Injectable()
export class PriceNormalizationService {
  normalize(
    priceCents: number,
    packSize: number,
    packUnit: string,
    unitCount: number,
  ): NormalizedPrices {
    const empty: NormalizedPrices = {
      pricePerKgCents: null,
      pricePerLCents: null,
      pricePerPieceCents: null,
    };
    if (!Number.isFinite(priceCents) || priceCents <= 0) {
      return empty;
    }
    if (!Number.isFinite(packSize) || packSize <= 0) {
      return empty;
    }
    const count = Number.isFinite(unitCount) && unitCount > 0 ? unitCount : 1;
    const canonical = packSizeToCanonical(packSize, packUnit, count);
    if (!Number.isFinite(canonical.value) || canonical.value <= 0) {
      return empty;
    }

    if (canonical.unit === 'g') {
      return { ...empty, pricePerKgCents: Math.round((priceCents / canonical.value) * 1000) };
    }
    if (canonical.unit === 'ml') {
      return { ...empty, pricePerLCents: Math.round((priceCents / canonical.value) * 1000) };
    }
    return { ...empty, pricePerPieceCents: Math.round(priceCents / canonical.value) };
  }
}
