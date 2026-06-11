import type { RawPriceRow } from './price-source-adapter.interface';

/**
 * Tolerant field mapping shared by the CSV, Excel and JSON-feed adapters.
 * Header/key aliases are normalized (lowercased, non-alphanumerics collapsed
 * to underscores) before lookup.
 */

const FIELD_ALIASES: Record<string, string[]> = {
  name: ['name', 'product', 'product_name', 'item', 'item_name', 'title', 'description_name'],
  brand: ['brand', 'brand_name', 'manufacturer'],
  category: ['category', 'category_name', 'department', 'aisle'],
  priceDollars: ['price', 'price_sgd', 'price_dollars', 'unit_price', 'selling_price', 'amount'],
  priceCents: ['price_cents', 'pricecents', 'cents'],
  wasPriceDollars: ['was_price', 'original_price', 'regular_price', 'list_price'],
  wasPriceCents: ['was_price_cents', 'original_price_cents'],
  promoPriceDollars: ['promo_price', 'sale_price', 'discount_price', 'offer_price'],
  isPromo: ['is_promo', 'promo', 'on_sale', 'is_on_promotion'],
  packSize: ['size', 'pack_size', 'packsize', 'weight', 'volume', 'net_weight'],
  packUnit: ['unit', 'pack_unit', 'packunit', 'uom', 'size_unit', 'weight_unit'],
  unitCount: ['unit_count', 'count', 'qty_per_pack', 'multipack', 'pack_count'],
  externalId: ['sku', 'external_id', 'externalid', 'product_id', 'id', 'barcode', 'ean'],
  imageUrl: ['image', 'image_url', 'imageurl', 'img', 'thumbnail'],
  isOrganic: ['organic', 'is_organic'],
  isHalal: ['halal', 'is_halal'],
  qualityTier: ['quality', 'quality_tier', 'tier'],
};

export function normalizeKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function buildLookup(record: Record<string, unknown>): Map<string, unknown> {
  const lookup = new Map<string, unknown>();
  for (const [key, value] of Object.entries(record)) {
    lookup.set(normalizeKey(key), value);
  }
  return lookup;
}

function pick(lookup: Map<string, unknown>, field: keyof typeof FIELD_ALIASES): unknown {
  for (const alias of FIELD_ALIASES[field]) {
    const value = lookup.get(alias);
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  return s.length > 0 ? s : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  const cleaned = String(value).replace(/[$,\s]/g, '').replace(/sgd/i, '');
  if (cleaned === '') return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  const s = String(value).trim().toLowerCase();
  if (['true', 'yes', 'y', '1'].includes(s)) return true;
  if (['false', 'no', 'n', '0', ''].includes(s)) return false;
  return undefined;
}

function dollarsToCents(value: number): number {
  return Math.round(value * 100);
}

const UNIT_MAP: Record<string, RawPriceRow['packUnit']> = {
  g: 'G',
  gr: 'G',
  gram: 'G',
  grams: 'G',
  kg: 'KG',
  kilo: 'KG',
  kilogram: 'KG',
  kilograms: 'KG',
  ml: 'ML',
  milliliter: 'ML',
  millilitre: 'ML',
  l: 'L',
  liter: 'L',
  litre: 'L',
  ltr: 'L',
  pc: 'PIECE',
  pcs: 'PIECE',
  piece: 'PIECE',
  pieces: 'PIECE',
  ea: 'PIECE',
  each: 'PIECE',
  unit: 'PIECE',
  pack: 'PACK',
  packs: 'PACK',
  pkt: 'PACK',
  packet: 'PACK',
};

export function mapPackUnit(raw: string | undefined): RawPriceRow['packUnit'] | undefined {
  if (!raw) return undefined;
  return UNIT_MAP[raw.trim().toLowerCase()];
}

/** Parse combined size strings like "500g", "1.5 kg", "2 x 200ml". */
function parseSizeString(
  raw: string,
): { packSize: number; packUnit: RawPriceRow['packUnit']; unitCount?: number } | undefined {
  const multi = raw.match(/^\s*(\d+)\s*[x×]\s*([\d.]+)\s*([a-zA-Z]+)\s*$/);
  if (multi) {
    const unit = mapPackUnit(multi[3]);
    if (unit) {
      return { packSize: Number(multi[2]), packUnit: unit, unitCount: Number(multi[1]) };
    }
  }
  const single = raw.match(/^\s*([\d.]+)\s*([a-zA-Z]+)\s*$/);
  if (single) {
    const unit = mapPackUnit(single[2]);
    if (unit) {
      return { packSize: Number(single[1]), packUnit: unit };
    }
  }
  return undefined;
}

export class RowMappingError extends Error {}

/**
 * Map one loosely-structured record (CSV row, Excel row object, JSON feed
 * item) into a RawPriceRow. Throws RowMappingError when mandatory fields are
 * missing or invalid.
 */
export function mapRecordToRow(record: Record<string, unknown>): RawPriceRow {
  const lookup = buildLookup(record);

  const name = asString(pick(lookup, 'name'));
  if (!name) {
    throw new RowMappingError('Missing product name');
  }

  // ---- price ----
  let priceCents: number | undefined;
  const centsValue = asNumber(pick(lookup, 'priceCents'));
  if (centsValue !== undefined) {
    priceCents = Math.round(centsValue);
  } else {
    const dollars = asNumber(pick(lookup, 'priceDollars'));
    if (dollars !== undefined) {
      priceCents = dollarsToCents(dollars);
    }
  }
  if (priceCents === undefined || priceCents <= 0) {
    throw new RowMappingError(`Missing or invalid price for "${name}"`);
  }

  let wasPriceCents: number | undefined;
  const wasCents = asNumber(pick(lookup, 'wasPriceCents'));
  const wasDollars = asNumber(pick(lookup, 'wasPriceDollars'));
  if (wasCents !== undefined) {
    wasPriceCents = Math.round(wasCents);
  } else if (wasDollars !== undefined) {
    wasPriceCents = dollarsToCents(wasDollars);
  }

  let isPromo = asBoolean(pick(lookup, 'isPromo')) ?? false;
  const promoDollars = asNumber(pick(lookup, 'promoPriceDollars'));
  if (promoDollars !== undefined) {
    const promoCents = dollarsToCents(promoDollars);
    if (promoCents > 0 && promoCents < priceCents) {
      wasPriceCents = priceCents;
      priceCents = promoCents;
      isPromo = true;
    }
  }
  if (wasPriceCents !== undefined && wasPriceCents > priceCents) {
    isPromo = true;
  }

  // ---- pack size / unit ----
  let packSize = 1;
  let packUnit: RawPriceRow['packUnit'] = 'PIECE';
  let unitCount = asNumber(pick(lookup, 'unitCount'));

  const sizeRaw = pick(lookup, 'packSize');
  const unitRaw = asString(pick(lookup, 'packUnit'));
  const sizeNumber = asNumber(sizeRaw);
  const mappedUnit = mapPackUnit(unitRaw);

  if (sizeNumber !== undefined && sizeNumber > 0 && mappedUnit) {
    packSize = sizeNumber;
    packUnit = mappedUnit;
  } else if (sizeRaw !== undefined) {
    const parsed = parseSizeString(String(sizeRaw));
    if (parsed) {
      packSize = parsed.packSize;
      packUnit = parsed.packUnit;
      if (parsed.unitCount !== undefined && unitCount === undefined) {
        unitCount = parsed.unitCount;
      }
    } else if (sizeNumber !== undefined && sizeNumber > 0) {
      packSize = sizeNumber;
      packUnit = mappedUnit ?? 'PIECE';
    }
  } else if (mappedUnit) {
    packUnit = mappedUnit;
  }

  const qualityTierRaw = asNumber(pick(lookup, 'qualityTier'));
  const qualityTier =
    qualityTierRaw !== undefined ? Math.min(3, Math.max(1, Math.round(qualityTierRaw))) : undefined;

  const row: RawPriceRow = {
    name,
    packSize,
    packUnit,
    priceCents,
  };
  const externalId = asString(pick(lookup, 'externalId'));
  if (externalId) row.externalId = externalId;
  const brand = asString(pick(lookup, 'brand'));
  if (brand) row.brand = brand;
  const category = asString(pick(lookup, 'category'));
  if (category) row.category = category;
  if (unitCount !== undefined && unitCount > 0) row.unitCount = Math.round(unitCount);
  if (wasPriceCents !== undefined) row.wasPriceCents = wasPriceCents;
  if (isPromo) row.isPromo = true;
  const imageUrl = asString(pick(lookup, 'imageUrl'));
  if (imageUrl) row.imageUrl = imageUrl;
  const isOrganic = asBoolean(pick(lookup, 'isOrganic'));
  if (isOrganic !== undefined) row.isOrganic = isOrganic;
  const isHalal = asBoolean(pick(lookup, 'isHalal'));
  if (isHalal !== undefined) row.isHalal = isHalal;
  if (qualityTier !== undefined) row.qualityTier = qualityTier;

  return row;
}
