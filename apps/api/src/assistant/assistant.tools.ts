/**
 * JSON-schema tool definitions for the grocery assistant tool loop.
 * Executors live in AssistantService.
 */

const STORE_CODES = [
  'FAIRPRICE',
  'SHENG_SIONG',
  'GIANT',
  'COLD_STORAGE',
  'PRIME',
  'REDMART',
  'AMAZON_FRESH',
] as const;

export interface AssistantToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export const ASSISTANT_TOOLS: AssistantToolDefinition[] = [
  {
    name: 'search_products',
    description:
      'Search Singapore grocery products by name (fuzzy), optionally within a single store. Returns up to 5 products with their latest prices in SGD cents.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Product name to search, e.g. "jasmine rice"' },
        storeCode: {
          type: 'string',
          enum: [...STORE_CODES],
          description: 'Optional store to restrict the search to',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'compare_ingredient_prices',
    description:
      'Find the cheapest current offer per store for an ingredient (e.g. "chicken breast"). Returns one cheapest product per store, sorted by price.',
    parameters: {
      type: 'object',
      properties: {
        ingredient: { type: 'string', description: 'Ingredient name' },
      },
      required: ['ingredient'],
    },
  },
  {
    name: 'get_pantry',
    description:
      "Get a summary of the user's current pantry/fridge/freezer items (name, quantity, location, expiry).",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_recipes',
    description:
      'Find up to 5 recipes the user can access, optionally filtered by a title query and a maximum estimated cost per serving (SGD cents). Includes nutrition per serving.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optional title search, e.g. "laksa"' },
        maxCostCents: {
          type: 'number',
          description: 'Optional maximum estimated cost per serving in cents',
        },
      },
    },
  },
  {
    name: 'get_budget_status',
    description:
      "Get the user's weekly grocery budget versus what they have spent on purchased baskets this week (Monday-start).",
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'suggest_substitutions',
    description:
      'Suggest ingredient substitutions (with quantity ratios and notes) for an ingredient the user wants to replace.',
    parameters: {
      type: 'object',
      properties: {
        ingredient: { type: 'string', description: 'Ingredient to substitute' },
      },
      required: ['ingredient'],
    },
  },
];
