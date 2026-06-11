import { z } from 'zod';

// ---- Auth ----

export const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[a-z]/, 'Must contain a lowercase letter')
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[0-9]/, 'Must contain a digit'),
  name: z.string().min(1).max(100).trim(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(16),
  password: registerSchema.shape.password,
});

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  dietaryRestrictions: z.array(z.string().max(50)).max(20).optional(),
  allergies: z.array(z.string().max(50)).max(20).optional(),
  householdSize: z.number().int().min(1).max(20).optional(),
  weeklyBudgetCents: z.number().int().min(0).max(10_000_00).nullable().optional(),
  preferredStores: z
    .array(
      z.enum([
        'FAIRPRICE',
        'SHENG_SIONG',
        'GIANT',
        'COLD_STORAGE',
        'PRIME',
        'REDMART',
        'AMAZON_FRESH',
      ]),
    )
    .optional(),
  nutritionGoals: z
    .object({
      dailyCalories: z.number().int().min(800).max(6000).optional(),
      dailyProteinG: z.number().int().min(0).max(400).optional(),
    })
    .optional(),
});

// ---- Recipes ----

export const manualRecipeSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  description: z.string().max(2000).optional(),
  servings: z.number().int().min(1).max(50).default(2),
  prepMinutes: z.number().int().min(0).max(1440).optional(),
  cookMinutes: z.number().int().min(0).max(1440).optional(),
  cuisine: z.string().max(50).optional(),
  tags: z.array(z.string().max(30)).max(15).default([]),
  instructions: z.array(z.string().max(2000)).max(50).default([]),
  ingredients: z
    .array(
      z.object({
        rawText: z.string().min(1).max(300),
        optional: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(100),
});

export const importUrlSchema = z.object({
  url: z.string().url().max(2048),
});

export const pasteRecipeSchema = z.object({
  text: z.string().min(20).max(50_000),
});

// ---- Baskets ----

export const optimizeBasketSchema = z.object({
  recipeId: z.string().uuid().optional(),
  ingredientNames: z.array(z.string().min(1).max(200)).max(100).optional(),
  strategy: z.enum(['CHEAPEST', 'CONVENIENCE', 'DELIVERY', 'QUALITY']).default('CHEAPEST'),
  servingsMultiplier: z.number().min(0.25).max(20).default(1),
  excludeStores: z.array(z.string()).default([]),
  usePantry: z.boolean().default(true),
});

// ---- Pantry ----

export const createPantryItemSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  quantity: z.number().min(0).max(100_000).default(1),
  unit: z.string().max(30).default('piece'),
  location: z.enum(['PANTRY', 'FRIDGE', 'FREEZER']).default('PANTRY'),
  expiresAt: z.string().datetime().nullable().optional(),
  purchasedAt: z.string().datetime().nullable().optional(),
  pricePaidCents: z.number().int().min(0).optional(),
});

export const updatePantryItemSchema = createPantryItemSchema.partial().extend({
  consumed: z.boolean().optional(),
  wasted: z.boolean().optional(),
});

// ---- Meal plans ----

export const generateMealPlanSchema = z.object({
  period: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']).default('WEEKLY'),
  startDate: z.string().date(),
  budgetCents: z.number().int().min(500).max(500_000).optional(),
  targetCalories: z.number().int().min(800).max(6000).optional(),
  targetProteinG: z.number().int().min(0).max(400).optional(),
  dietaryRestrictions: z.array(z.string().max(50)).max(20).default([]),
  mealsPerDay: z.number().int().min(1).max(4).default(3),
  usePantry: z.boolean().default(true),
});

// ---- Alerts ----

export const upsertAlertSchema = z.object({
  type: z.enum(['PRICE_DROP', 'PROMOTION', 'EXPIRING_INGREDIENT', 'BUDGET_OVERRUN']),
  enabled: z.boolean().default(true),
  threshold: z.number().min(0).max(100).optional(),
  channel: z.enum(['in_app', 'email', 'both']).default('in_app'),
});

// ---- Assistant ----

export const chatMessageSchema = z.object({
  sessionId: z.string().uuid().optional(),
  message: z.string().min(1).max(4000),
});

// ---- Price submissions ----

export const priceSubmissionSchema = z.object({
  storeCode: z.enum([
    'FAIRPRICE',
    'SHENG_SIONG',
    'GIANT',
    'COLD_STORAGE',
    'PRIME',
    'REDMART',
    'AMAZON_FRESH',
  ]),
  productName: z.string().min(2).max(200),
  priceCents: z.number().int().min(1).max(1_000_00),
  packSize: z.number().min(0).optional(),
  packUnit: z.string().max(20).optional(),
});

// ---- Pagination ----

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ManualRecipeInput = z.infer<typeof manualRecipeSchema>;
export type OptimizeBasketInput = z.infer<typeof optimizeBasketSchema>;
export type CreatePantryItemInput = z.infer<typeof createPantryItemSchema>;
export type GenerateMealPlanInput = z.infer<typeof generateMealPlanSchema>;
export type ChatMessageInput = z.infer<typeof chatMessageSchema>;
export type PriceSubmissionInput = z.infer<typeof priceSubmissionSchema>;
