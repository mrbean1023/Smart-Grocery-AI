import { load } from 'cheerio';
import { z } from 'zod';

/** Structured recipe shape shared by JSON-LD extraction and AI structuring. */
export interface StructuredRecipe {
  title: string;
  description: string | null;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  cuisine: string | null;
  tags: string[];
  instructions: string[];
  imageUrl: string | null;
  ingredients: Array<{ rawText: string; optional: boolean }>;
}

/** Lenient validation of the AI chatJson output. */
export const aiStructuredRecipeSchema = z.object({
  title: z.string().trim().min(1).max(200).catch('Imported recipe'),
  description: z.string().max(2000).nullable().catch(null),
  servings: z.coerce.number().int().min(1).max(50).catch(2),
  prepMinutes: z.coerce.number().int().min(0).max(1440).nullable().catch(null),
  cookMinutes: z.coerce.number().int().min(0).max(1440).nullable().catch(null),
  cuisine: z.string().max(50).nullable().catch(null),
  tags: z.array(z.string().trim().min(1).max(30)).max(15).catch([]),
  instructions: z.array(z.string().trim().min(1).max(2000)).max(50).catch([]),
  ingredients: z
    .array(
      z.object({
        rawText: z.string().trim().min(1).max(300),
        optional: z.boolean().catch(false),
      }),
    )
    .min(1)
    .max(100),
});

export type AiStructuredRecipe = z.infer<typeof aiStructuredRecipeSchema>;

/** "PT1H30M" → 90. Returns null for unparseable values. */
export function parseIso8601DurationToMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = value
    .trim()
    .match(/^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);
  if (!match) return null;
  const [, days, hours, minutes, seconds] = match;
  if (!days && !hours && !minutes && !seconds) return null;
  const total =
    (days ? Number(days) * 1440 : 0) +
    (hours ? Number(hours) * 60 : 0) +
    (minutes ? Number(minutes) : 0) +
    (seconds ? Number(seconds) / 60 : 0);
  return Math.round(total);
}

function asArray(value: unknown): unknown[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function typeIncludes(node: Record<string, unknown>, type: string): boolean {
  const t = node['@type'];
  if (typeof t === 'string') return t.toLowerCase() === type.toLowerCase();
  if (Array.isArray(t)) {
    return t.some((x) => typeof x === 'string' && x.toLowerCase() === type.toLowerCase());
  }
  return false;
}

function firstString(value: unknown): string | null {
  for (const item of asArray(value)) {
    if (typeof item === 'string' && item.trim()) return item.trim();
  }
  return null;
}

function extractYield(value: unknown): number | null {
  for (const item of asArray(value)) {
    if (typeof item === 'number' && Number.isFinite(item) && item > 0) {
      return Math.round(item);
    }
    if (typeof item === 'string') {
      const match = item.match(/\d+/);
      if (match) {
        const n = parseInt(match[0], 10);
        if (n > 0 && n <= 100) return n;
      }
    }
  }
  return null;
}

function extractImage(value: unknown): string | null {
  for (const item of asArray(value)) {
    if (typeof item === 'string' && /^https?:\/\//i.test(item)) return item;
    if (typeof item === 'object' && item !== null) {
      const url = (item as Record<string, unknown>).url;
      if (typeof url === 'string' && /^https?:\/\//i.test(url)) return url;
    }
  }
  return null;
}

function extractInstructions(value: unknown): string[] {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') {
      const text = node.trim();
      if (text) {
        // a single blob may contain newline-separated steps
        for (const line of text.split(/\n+/)) {
          const step = line.trim();
          if (step) out.push(step);
        }
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node === 'object' && node !== null) {
      const obj = node as Record<string, unknown>;
      if (typeIncludes(obj, 'HowToSection')) {
        walk(obj.itemListElement);
        return;
      }
      if (typeof obj.text === 'string' && obj.text.trim()) {
        out.push(obj.text.trim());
        return;
      }
      if (typeof obj.name === 'string' && obj.name.trim()) {
        out.push(obj.name.trim());
        return;
      }
      if (obj.itemListElement) walk(obj.itemListElement);
    }
  };
  walk(value);
  return out.slice(0, 50);
}

function extractTags(value: unknown): string[] {
  const tags: string[] = [];
  for (const item of asArray(value)) {
    if (typeof item !== 'string') continue;
    for (const part of item.split(',')) {
      const tag = part.trim().toLowerCase().slice(0, 30);
      if (tag && !tags.includes(tag)) tags.push(tag);
    }
  }
  return tags.slice(0, 15);
}

function collectJsonLdCandidates(parsed: unknown): Array<Record<string, unknown>> {
  const candidates: Array<Record<string, unknown>> = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node === 'object' && node !== null) {
      const obj = node as Record<string, unknown>;
      candidates.push(obj);
      if (obj['@graph']) visit(obj['@graph']);
      if (obj.mainEntity) visit(obj.mainEntity);
    }
  };
  visit(parsed);
  return candidates;
}

function mapRecipeNode(node: Record<string, unknown>): StructuredRecipe | null {
  const ingredientLines = asArray(node.recipeIngredient ?? node.ingredients)
    .filter((line): line is string => typeof line === 'string' && line.trim().length > 0)
    .map((line) => line.trim().slice(0, 300));
  const title = firstString(node.name);
  if (!title && ingredientLines.length === 0) return null;
  return {
    title: (title ?? 'Imported recipe').slice(0, 200),
    description: firstString(node.description)?.slice(0, 2000) ?? null,
    servings: extractYield(node.recipeYield) ?? 2,
    prepMinutes: parseIso8601DurationToMinutes(firstString(node.prepTime)),
    cookMinutes: parseIso8601DurationToMinutes(firstString(node.cookTime)),
    cuisine: firstString(node.recipeCuisine)?.slice(0, 50) ?? null,
    tags: extractTags(node.keywords),
    instructions: extractInstructions(node.recipeInstructions),
    imageUrl: extractImage(node.image),
    ingredients: ingredientLines
      .slice(0, 100)
      .map((rawText) => ({ rawText, optional: /optional/i.test(rawText) })),
  };
}

/**
 * Pull a schema.org/Recipe out of <script type="application/ld+json"> blocks.
 * Handles top-level arrays, @graph wrappers and HowToStep/HowToSection
 * instruction shapes. Returns null when no usable Recipe node exists.
 */
export function extractRecipeJsonLd(html: string): StructuredRecipe | null {
  const $ = load(html);
  const scripts = $('script[type="application/ld+json"]');
  for (const el of scripts.toArray()) {
    const raw = $(el).contents().text().trim();
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue; // malformed JSON-LD block — try the next one
    }
    for (const candidate of collectJsonLdCandidates(parsed)) {
      if (!typeIncludes(candidate, 'Recipe')) continue;
      const mapped = mapRecipeNode(candidate);
      if (mapped && mapped.ingredients.length > 0) return mapped;
    }
  }
  return null;
}

const RECIPE_CONTAINER_SELECTORS = [
  '[itemtype*="Recipe"]',
  '[class*="recipe-content"]',
  '[class*="recipe-card"]',
  '[id*="recipe"]',
  '[class*="recipe"]',
  'article',
  'main',
];

/** Visible-text fallback for pages without JSON-LD. */
export function extractVisibleText(html: string): string {
  const $ = load(html);
  $('script, style, noscript, svg, iframe, form, nav, footer, header, aside').remove();
  let text = '';
  for (const selector of RECIPE_CONTAINER_SELECTORS) {
    const candidate = $(selector).first().text().replace(/\s+/g, ' ').trim();
    if (candidate.length > 200) {
      text = candidate;
      break;
    }
  }
  if (!text) {
    text = $('body').text().replace(/\s+/g, ' ').trim();
  }
  return text.slice(0, 20_000);
}

/** Serialize a structured recipe back into plain text (stored as rawText). */
export function structuredRecipeToRawText(recipe: StructuredRecipe): string {
  const lines: string[] = [recipe.title];
  if (recipe.description) lines.push(recipe.description);
  lines.push('', 'Ingredients:');
  for (const ing of recipe.ingredients) lines.push(`- ${ing.rawText}`);
  if (recipe.instructions.length > 0) {
    lines.push('', 'Instructions:');
    recipe.instructions.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
  }
  return lines.join('\n').slice(0, 50_000);
}
