import type { IngestionType, StoreCode } from '@prisma/client';

export interface RawPriceRow {
  externalId?: string;
  name: string;
  brand?: string;
  category?: string;
  packSize: number;
  packUnit: 'G' | 'KG' | 'ML' | 'L' | 'PIECE' | 'PACK';
  unitCount?: number;
  priceCents: number;
  wasPriceCents?: number;
  isPromo?: boolean;
  imageUrl?: string;
  isOrganic?: boolean;
  isHalal?: boolean;
  qualityTier?: number;
}

export interface PriceSourceAdapter {
  readonly type: IngestionType;
  parse(buffer: Buffer, storeCode: StoreCode): Promise<RawPriceRow[]>;
}
