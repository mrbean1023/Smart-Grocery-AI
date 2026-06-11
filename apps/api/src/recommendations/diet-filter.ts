/**
 * Dietary-restriction checker shared by recommendations and meal planning.
 *
 * Works on ingredient categories + lowercase ingredient names (falling back to
 * recipe ingredient raw text) and recipe tags. Restriction keys follow the
 * shared DIETARY_RESTRICTIONS constants (lowercase, hyphenated).
 *
 * Purely nutritional preferences (low-sodium, diabetic-friendly) are treated
 * as soft preferences and never exclude a recipe here — they influence
 * nutrition scoring instead.
 */

export interface DietIngredientLike {
  /** Canonical ingredient name or raw recipe text, any casing. */
  name: string | null;
  /** IngredientCategory enum value when the ingredient is linked. */
  category: string | null;
}

export interface DietRecipeLike {
  tags: string[];
  ingredients: DietIngredientLike[];
}

interface DietRule {
  forbiddenCategories: ReadonlySet<string>;
  forbiddenNamePatterns: RegExp[];
  /** Name matches that are allowed even when a forbidden pattern hits. */
  nameExceptions: RegExp[];
  forbiddenTags: ReadonlySet<string>;
  /**
   * When a forbidden tag matches, the recipe is still allowed if at least one
   * ingredient name matches one of these patterns (e.g. a "noodles"-tagged
   * dish made with rice noodles is fine for gluten-free).
   */
  tagExceptionPatterns?: RegExp[];
}

const MEAT_NAMES =
  /\b(chicken|beef|pork|lamb|mutton|duck|turkey|bacon|ham|sausage|lard|char\s?siu|luncheon meat|spam|gelatin[e]?|oyster sauce|fish sauce|shrimp paste|belacan)\b/;
const SEAFOOD_NAMES =
  /\b(fish|salmon|tuna|cod|prawn|shrimp|crab|lobster|squid|sotong|octopus|oyster|mussel|clam|scallop|anchov(y|ies)|ikan bilis|sardine)\b/;
const DAIRY_NAMES = /\b(milk|cheese|butter|cream|yogurt|yoghurt|ghee|whey|custard|condensed milk|evaporated milk)\b/;
const PLANT_MILK = /\b(coconut|soy|soya|almond|oat|rice|cashew)\s*(milk|cream|butter|yogurt|yoghurt)\b/;
const EGG_NAMES = /\b(egg|eggs)\b/;
const GLUTEN_NAMES =
  /\b(flour|noodle[s]?|pasta|spaghetti|macaroni|bread|baguette|wheat|barley|rye|udon|ramen|mee|kway teow|wonton|dumpling wrapper|soy sauce|couscous|semolina|breadcrumb[s]?)\b/;
const GLUTEN_EXCEPTIONS =
  /\b(rice noodle[s]?|rice vermicelli|glass noodle[s]?|kway teow|rice flour|corn ?flour|cornstarch|tapioca (flour|starch)|almond flour|coconut flour|buckwheat|gluten[- ]free|tamari)\b/;
const NUT_NAMES =
  /\b(peanut[s]?|almond[s]?|cashew[s]?|walnut[s]?|pecan[s]?|hazelnut[s]?|macadamia[s]?|pistachio[s]?|pine nut[s]?|mixed nuts|nut butter|satay)\b/;
const HALAL_FORBIDDEN =
  /\b(pork|lard|bacon|ham|char\s?siu|luncheon meat|gelatin[e]?|wine|beer|rum|brandy|whisky|vodka|sake|mirin|alcohol)\b/;
// "ham" alone is risky ("graham") — keep word-boundary matching, which handles it.

const RULES: Record<string, DietRule> = {
  vegetarian: {
    forbiddenCategories: new Set(['MEAT', 'SEAFOOD']),
    forbiddenNamePatterns: [MEAT_NAMES, SEAFOOD_NAMES],
    nameExceptions: [/\b(vegetarian|mock|plant[- ]based)\b/],
    forbiddenTags: new Set(['meat', 'seafood', 'pork', 'beef', 'chicken']),
  },
  vegan: {
    forbiddenCategories: new Set(['MEAT', 'SEAFOOD', 'DAIRY', 'EGGS']),
    forbiddenNamePatterns: [MEAT_NAMES, SEAFOOD_NAMES, DAIRY_NAMES, EGG_NAMES, /\bhoney\b/],
    nameExceptions: [PLANT_MILK, /\b(vegan|mock|plant[- ]based|eggplant)\b/],
    forbiddenTags: new Set(['meat', 'seafood', 'dairy', 'egg', 'eggs']),
  },
  pescatarian: {
    forbiddenCategories: new Set(['MEAT']),
    forbiddenNamePatterns: [MEAT_NAMES],
    nameExceptions: [/\b(fish sauce|oyster sauce|shrimp paste|belacan)\b/],
    forbiddenTags: new Set(['meat', 'pork', 'beef', 'chicken']),
  },
  halal: {
    forbiddenCategories: new Set<string>(),
    forbiddenNamePatterns: [HALAL_FORBIDDEN],
    nameExceptions: [/\b(halal|rice wine vinegar)\b/],
    forbiddenTags: new Set(['pork', 'alcohol']),
  },
  'gluten-free': {
    forbiddenCategories: new Set<string>(),
    forbiddenNamePatterns: [GLUTEN_NAMES],
    nameExceptions: [GLUTEN_EXCEPTIONS],
    forbiddenTags: new Set(['noodles', 'bread', 'pasta', 'bakery']),
    tagExceptionPatterns: [GLUTEN_EXCEPTIONS],
  },
  'dairy-free': {
    forbiddenCategories: new Set(['DAIRY']),
    forbiddenNamePatterns: [DAIRY_NAMES],
    nameExceptions: [PLANT_MILK],
    forbiddenTags: new Set(['dairy']),
  },
  'nut-free': {
    forbiddenCategories: new Set<string>(),
    forbiddenNamePatterns: [NUT_NAMES],
    nameExceptions: [/\b(coconut|nutmeg|butternut|water chestnut)\b/],
    forbiddenTags: new Set(['nuts', 'peanut', 'satay']),
  },
  'low-carb': {
    forbiddenCategories: new Set(['GRAINS', 'BAKERY', 'NOODLES_PASTA']),
    forbiddenNamePatterns: [/\b(sugar|rice|noodle[s]?|pasta|bread|potato(es)?)\b/],
    nameExceptions: [/\b(cauliflower rice|shirataki|konjac)\b/],
    forbiddenTags: new Set(['dessert', 'noodles', 'bread', 'rice']),
  },
  // Soft preferences — never exclude:
  'low-sodium': {
    forbiddenCategories: new Set<string>(),
    forbiddenNamePatterns: [],
    nameExceptions: [],
    forbiddenTags: new Set<string>(),
  },
  'diabetic-friendly': {
    forbiddenCategories: new Set<string>(),
    forbiddenNamePatterns: [],
    nameExceptions: [],
    forbiddenTags: new Set<string>(),
  },
};

function normalizeRestriction(restriction: string): string {
  return restriction.trim().toLowerCase().replace(/\s+/g, '-');
}

function nameViolates(name: string, rule: DietRule): boolean {
  if (rule.nameExceptions.some((re) => re.test(name))) return false;
  return rule.forbiddenNamePatterns.some((re) => re.test(name));
}

/**
 * Returns the first restriction the recipe violates, or null when allowed.
 */
export function findDietViolation(recipe: DietRecipeLike, restrictions: string[]): string | null {
  for (const raw of restrictions) {
    const key = normalizeRestriction(raw);
    const rule = RULES[key];
    if (!rule) continue; // unknown restriction — be permissive rather than empty results

    for (const ing of recipe.ingredients) {
      if (ing.category && rule.forbiddenCategories.has(ing.category)) return key;
      const name = (ing.name ?? '').toLowerCase();
      if (name && nameViolates(name, rule)) return key;
    }

    const tags = recipe.tags.map((t) => t.toLowerCase());
    const tagHit = tags.some((t) => rule.forbiddenTags.has(t));
    if (tagHit) {
      const exempt =
        rule.tagExceptionPatterns &&
        recipe.ingredients.some((ing) =>
          rule.tagExceptionPatterns!.some((re) => re.test((ing.name ?? '').toLowerCase())),
        );
      if (!exempt) return key;
    }
  }
  return null;
}

/** True when the recipe satisfies every restriction in the list. */
export function isRecipeAllowed(recipe: DietRecipeLike, restrictions: string[]): boolean {
  if (restrictions.length === 0) return true;
  return findDietViolation(recipe, restrictions) === null;
}

export function filterRecipesByDiet<T extends DietRecipeLike>(
  recipes: T[],
  restrictions: string[],
): T[] {
  if (restrictions.length === 0) return recipes;
  return recipes.filter((r) => isRecipeAllowed(r, restrictions));
}
