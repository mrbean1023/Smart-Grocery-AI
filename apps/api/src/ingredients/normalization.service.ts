import { Injectable } from '@nestjs/common';
import {
  isCountUnit,
  isMassUnit,
  isVolumeUnit,
  normalizeUnitToken,
} from '@smart-grocery/shared';

export interface ParsedIngredientLine {
  quantity: number | null;
  unit: string | null;
  name: string;
  optional: boolean;
}

const UNICODE_FRACTIONS: Record<string, string> = {
  '½': '1/2',
  '⅓': '1/3',
  '⅔': '2/3',
  '¼': '1/4',
  '¾': '3/4',
  '⅕': '1/5',
  '⅖': '2/5',
  '⅗': '3/5',
  '⅘': '4/5',
  '⅙': '1/6',
  '⅚': '5/6',
  '⅛': '1/8',
  '⅜': '3/8',
  '⅝': '5/8',
  '⅞': '7/8',
};

const FRACTION_CHARS = /[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]/g;

/** Single descriptor words removed from the matching name (rawText is preserved upstream). */
const DESCRIPTOR_WORDS = new Set([
  'fresh',
  'freshly',
  'chopped',
  'finely',
  'roughly',
  'coarsely',
  'thinly',
  'thickly',
  'diced',
  'minced',
  'sliced',
  'grated',
  'shredded',
  'julienned',
  'peeled',
  'crushed',
  'beaten',
  'whisked',
  'melted',
  'softened',
  'toasted',
  'rinsed',
  'drained',
  'washed',
  'trimmed',
  'deseeded',
  'seeded',
  'pitted',
  'halved',
  'quartered',
  'cubed',
  'large',
  'small',
  'medium',
  'ripe',
  'boneless',
  'skinless',
  'optional',
]);

/** Multi-word phrases removed from the matching name. */
const STRIP_PHRASES = [
  'or to taste',
  'to taste',
  'for garnish',
  'for serving',
  'for frying',
  'for deep frying',
  'for deep-frying',
  'as needed',
  'if needed',
  'at room temperature',
  'room temperature',
  'skin removed',
  'skin-on',
  'skin on',
  'bone-in',
  'bone in',
  'plus more to serve',
  'plus extra',
];

// number token: mixed number | fraction | decimal | integer
const NUM_PATTERN = '\\d+\\s+\\d+\\s*/\\s*\\d+|\\d+\\s*/\\s*\\d+|\\d*\\.\\d+|\\d+';
const RANGE_RE = new RegExp(
  `^(${NUM_PATTERN})\\s*(?:-|–|—|to)\\s*(${NUM_PATTERN})(?=\\s|$)`,
  'i',
);
const SINGLE_RE = new RegExp(`^(${NUM_PATTERN})(?=\\s|$)`);

function parseNumberToken(token: string): number {
  const trimmed = token.trim();
  const mixed = trimmed.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  }
  const fraction = trimmed.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fraction) {
    return Number(fraction[1]) / Number(fraction[2]);
  }
  return parseFloat(trimmed);
}

function isKnownUnit(token: string): boolean {
  return isMassUnit(token) || isVolumeUnit(token) || isCountUnit(token);
}

/**
 * Deterministic ingredient-line parser. No AI involved: this must behave
 * identically across runs so recipe re-processing is stable.
 */
@Injectable()
export class NormalizationService {
  normalizeLine(rawText: string): ParsedIngredientLine {
    let text = rawText.trim();
    if (!text) {
      return { quantity: null, unit: null, name: '', optional: false };
    }

    // -- optional flag --------------------------------------------------
    const optional =
      /\(\s*optional\s*\)/i.test(text) ||
      /,\s*optional\b/i.test(text) ||
      /^optional\b[:\s]/i.test(text);

    // -- strip leading list markers (-, *, •, "1.") ----------------------
    text = text.replace(/^[-•*]+\s*/, '');

    // -- parenthetical notes are removed for matching --------------------
    text = text.replace(/\([^)]*\)/g, ' ');

    // -- unicode fractions → ascii ---------------------------------------
    text = text.replace(FRACTION_CHARS, (ch) => ` ${UNICODE_FRACTIONS[ch]} `);
    text = text.replace(/\s+/g, ' ').trim();

    // -- split glued quantity+unit ("500g" → "500 g") ---------------------
    text = text.replace(
      /^(\d+(?:\.\d+)?)([a-zA-Z]+)/,
      (match, num: string, suffix: string) =>
        isKnownUnit(suffix) ? `${num} ${suffix}` : match,
    );

    // -- quantity ---------------------------------------------------------
    let quantity: number | null = null;
    let rest = text;
    const range = rest.match(RANGE_RE);
    if (range) {
      // ranges like "2-3" or "2 to 3" → midpoint
      quantity = (parseNumberToken(range[1]) + parseNumberToken(range[2])) / 2;
      rest = rest.slice(range[0].length).trim();
    } else {
      const single = rest.match(SINGLE_RE);
      if (single) {
        quantity = parseNumberToken(single[1]);
        rest = rest.slice(single[0].length).trim();
      }
    }

    // -- unit ---------------------------------------------------------------
    let unit: string | null = null;
    if (quantity !== null && rest) {
      // two-word units first ("fl oz")
      const two = rest.match(/^([a-zA-Z]+\s+[a-zA-Z]+)(?=\s|$|[.,])/);
      const twoToken = two ? normalizeUnitToken(two[1].replace(/\s+/g, ' ')) : null;
      if (twoToken && (isMassUnit(twoToken) || isVolumeUnit(twoToken))) {
        unit = twoToken;
        rest = rest.slice(two![1].length).trim();
      } else {
        const one = rest.match(/^([a-zA-Z]+)\.?(?=\s|$|,)/);
        if (one) {
          const token = normalizeUnitToken(one[1]);
          if (isKnownUnit(token)) {
            unit = token;
            rest = rest.slice(one[0].length).trim();
          }
        }
      }
      // "2 cups of rice" → drop the connective
      rest = rest.replace(/^of\s+/i, '');
    }

    // -- name --------------------------------------------------------------
    // Trailing prep clauses live after the first comma ("garlic, minced").
    let name = rest.split(',')[0].trim();
    for (const phrase of STRIP_PHRASES) {
      name = name.replace(new RegExp(`\\b${phrase.replace(/[-/]/g, '\\$&')}\\b`, 'gi'), ' ');
    }
    name = name
      .split(/\s+/)
      .filter((word) => word.length > 0 && !DESCRIPTOR_WORDS.has(word.toLowerCase()))
      .join(' ')
      .replace(/^[\s.,;:&-]+|[\s.,;:&-]+$/g, '')
      .replace(/\s+/g, ' ')
      .toLowerCase();

    // "2 eggs" → quantity 2, unit "eggs", empty name. The unit token IS the
    // ingredient: report it as the name with a piece unit.
    if (!name && unit) {
      name = unit;
      unit = isCountUnit(unit) ? 'piece' : unit;
    }
    if (!name) {
      name = rawText.trim().toLowerCase();
    }

    return { quantity, unit, name, optional };
  }
}
