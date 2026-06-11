/**
 * Unit conversion engine.
 * Canonical units: grams (mass), millilitres (volume), piece (count).
 */

export type CanonicalUnit = 'g' | 'ml' | 'piece';

export interface ParsedQuantity {
  quantity: number;
  unit: string;
}

export interface NormalizedQuantity {
  value: number;
  unit: CanonicalUnit;
}

const MASS_TO_GRAMS: Record<string, number> = {
  g: 1, gram: 1, grams: 1, gr: 1,
  kg: 1000, kilogram: 1000, kilograms: 1000, kilo: 1000, kilos: 1000,
  mg: 0.001,
  oz: 28.3495, ounce: 28.3495, ounces: 28.3495,
  lb: 453.592, lbs: 453.592, pound: 453.592, pounds: 453.592,
  catty: 604.79, kati: 604.79, // SG/MY wet-market unit
  tahil: 37.8, // 1/16 catty
};

const VOLUME_TO_ML: Record<string, number> = {
  ml: 1, milliliter: 1, milliliters: 1, millilitre: 1, millilitres: 1,
  l: 1000, liter: 1000, liters: 1000, litre: 1000, litres: 1000,
  dl: 100, cl: 10,
  cup: 250, cups: 250, // metric cup (SG standard)
  tbsp: 15, tablespoon: 15, tablespoons: 15,
  tsp: 5, teaspoon: 5, teaspoons: 5,
  'fl oz': 29.5735, floz: 29.5735,
  pint: 473.176, pints: 473.176,
  quart: 946.353,
  gallon: 3785.41,
  dash: 0.6, pinch: 0.3, drop: 0.05,
};

const COUNT_UNITS = new Set([
  'piece', 'pieces', 'pc', 'pcs', 'whole', 'unit', 'units',
  'clove', 'cloves', 'slice', 'slices', 'stalk', 'stalks',
  'sprig', 'sprigs', 'leaf', 'leaves', 'head', 'heads',
  'bunch', 'bunches', 'can', 'cans', 'tin', 'tins',
  'packet', 'packets', 'pack', 'packs', 'bottle', 'bottles',
  'egg', 'eggs', 'fillet', 'fillets', 'thigh', 'thighs',
  'breast', 'breasts', 'drumstick', 'drumsticks', 'cube', 'cubes',
  'sheet', 'sheets', 'stick', 'sticks', 'wedge', 'wedges',
]);

/** Approximate grams per count-unit when ingredient-specific data is missing. */
const COUNT_UNIT_DEFAULT_GRAMS: Record<string, number> = {
  clove: 5, cloves: 5,
  slice: 25, slices: 25,
  stalk: 40, stalks: 40,
  sprig: 2, sprigs: 2,
  leaf: 1, leaves: 1,
  head: 500, heads: 500,
  bunch: 150, bunches: 150,
  can: 400, cans: 400, tin: 400, tins: 400,
  egg: 55, eggs: 55,
  fillet: 150, fillets: 150,
  thigh: 120, thighs: 120,
  breast: 250, breasts: 250,
  drumstick: 100, drumsticks: 100,
  cube: 10, cubes: 10,
  sheet: 20, sheets: 20,
  stick: 113, sticks: 113,
  wedge: 30, wedges: 30,
  packet: 200, packets: 200, pack: 200, packs: 200,
  bottle: 500, bottles: 500,
};

export function normalizeUnitToken(unit: string): string {
  return unit.trim().toLowerCase().replace(/\.$/, '');
}

export function isMassUnit(unit: string): boolean {
  return normalizeUnitToken(unit) in MASS_TO_GRAMS;
}

export function isVolumeUnit(unit: string): boolean {
  return normalizeUnitToken(unit) in VOLUME_TO_ML;
}

export function isCountUnit(unit: string): boolean {
  return COUNT_UNITS.has(normalizeUnitToken(unit));
}

/**
 * Convert a quantity to canonical units.
 * @param density g/ml — converts volume to mass when provided
 * @param gramsPerPiece ingredient-specific weight per piece
 */
export function toCanonical(
  quantity: number,
  unit: string,
  opts: { density?: number | null; gramsPerPiece?: number | null } = {},
): NormalizedQuantity {
  const u = normalizeUnitToken(unit);

  if (u in MASS_TO_GRAMS) {
    return { value: quantity * MASS_TO_GRAMS[u], unit: 'g' };
  }
  if (u in VOLUME_TO_ML) {
    const ml = quantity * VOLUME_TO_ML[u];
    if (opts.density && opts.density > 0) {
      return { value: ml * opts.density, unit: 'g' };
    }
    return { value: ml, unit: 'ml' };
  }
  if (COUNT_UNITS.has(u)) {
    const perPiece = opts.gramsPerPiece ?? COUNT_UNIT_DEFAULT_GRAMS[u];
    if (perPiece && perPiece > 0) {
      return { value: quantity * perPiece, unit: 'g' };
    }
    return { value: quantity, unit: 'piece' };
  }
  // Unknown unit — treat as pieces so downstream logic still works
  return { value: quantity, unit: 'piece' };
}

/** Convert grams to the display unit a shopper expects. */
export function formatQuantity(value: number, unit: CanonicalUnit): string {
  if (unit === 'g') {
    if (value >= 1000) return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)} kg`;
    return `${Math.round(value)} g`;
  }
  if (unit === 'ml') {
    if (value >= 1000) return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)} L`;
    return `${Math.round(value)} ml`;
  }
  return `${value} pc${value === 1 ? '' : 's'}`;
}

/** Pack size of a product expressed in canonical grams/ml. */
export function packSizeToCanonical(
  packSize: number,
  packUnit: string,
  unitCount = 1,
): NormalizedQuantity {
  const norm = toCanonical(packSize, packUnit);
  return { value: norm.value * unitCount, unit: norm.unit };
}
