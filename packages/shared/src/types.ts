/** Shared API contract types. Mirrors Prisma enums — keep in sync with schema.prisma. */

export type UserRole = 'USER' | 'ADMIN' | 'MODERATOR';
export type SubscriptionTier = 'FREE' | 'PREMIUM';
export type SubscriptionStatus = 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'TRIALING' | 'INCOMPLETE';
export type RecipeSource = 'MANUAL' | 'IMAGE_OCR' | 'PDF_OCR' | 'URL_IMPORT' | 'AI_GENERATED';
export type RecipeStatus = 'PROCESSING' | 'READY' | 'FAILED';
export type StoreCode =
  | 'FAIRPRICE'
  | 'SHENG_SIONG'
  | 'GIANT'
  | 'COLD_STORAGE'
  | 'PRIME'
  | 'REDMART'
  | 'AMAZON_FRESH';
export type BasketStrategy = 'CHEAPEST' | 'CONVENIENCE' | 'DELIVERY' | 'QUALITY';
export type BasketStatus = 'DRAFT' | 'OPTIMIZED' | 'PURCHASED' | 'ARCHIVED';
export type PantryLocation = 'PANTRY' | 'FRIDGE' | 'FREEZER';
export type MealPlanPeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type MealType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK';
export type AlertType = 'PRICE_DROP' | 'PROMOTION' | 'EXPIRING_INGREDIENT' | 'BUDGET_OVERRUN';
export type PriceSource =
  | 'SEED'
  | 'API'
  | 'MERCHANT_FEED'
  | 'CSV_IMPORT'
  | 'EXCEL_IMPORT'
  | 'RECEIPT_OCR'
  | 'CROWDSOURCED';
export type IngredientCategory =
  | 'PRODUCE'
  | 'MEAT'
  | 'SEAFOOD'
  | 'DAIRY'
  | 'EGGS'
  | 'GRAINS'
  | 'BAKERY'
  | 'CANNED'
  | 'FROZEN'
  | 'CONDIMENTS'
  | 'SPICES'
  | 'OILS'
  | 'BEVERAGES'
  | 'SNACKS'
  | 'NOODLES_PASTA'
  | 'TOFU_SOY'
  | 'SAUCES'
  | 'BAKING'
  | 'OTHER';
export type ProductUnit = 'G' | 'KG' | 'ML' | 'L' | 'PIECE' | 'PACK';

// ---- API envelope ----

export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
  details?: unknown;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ---- Auth ----

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: UserRole;
  emailVerified: boolean;
  tier: SubscriptionTier;
  dietaryRestrictions: string[];
  allergies: string[];
  householdSize: number;
  weeklyBudgetCents: number | null;
  preferredStores: StoreCode[];
  createdAt: string;
}

export interface AuthResponse {
  user: UserProfile;
  tokens: AuthTokens;
}

// ---- Recipes ----

export interface RecipeIngredientDto {
  id: string;
  rawText: string;
  quantity: number | null;
  unit: string | null;
  normalizedQtyG: number | null;
  optional: boolean;
  matchConfidence: number | null;
  ingredient: {
    id: string;
    name: string;
    displayName: string;
    category: IngredientCategory;
  } | null;
}

export interface NutritionDto {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fibreG: number;
  sodiumMg: number;
  sugarG: number;
  healthScore: number;
}

export interface RecipeDto {
  id: string;
  title: string;
  description: string | null;
  source: RecipeSource;
  status: RecipeStatus;
  sourceUrl: string | null;
  imageUrl: string | null;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  instructions: string[];
  tags: string[];
  cuisine: string | null;
  failureReason: string | null;
  ingredients: RecipeIngredientDto[];
  nutrition: NutritionDto | null;
  createdAt: string;
}

// ---- Stores / Products / Prices ----

export interface StoreDto {
  id: string;
  code: StoreCode;
  name: string;
  logoUrl: string | null;
  supportsDelivery: boolean;
  deliveryFeeCents: number;
  freeDeliveryMinCents: number | null;
  minOrderCents: number;
  qualityScore: number;
}

export interface ProductDto {
  id: string;
  storeId: string;
  store?: StoreDto;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  category: string | null;
  packSize: number;
  packUnit: ProductUnit;
  unitCount: number;
  isAvailable: boolean;
  isOrganic: boolean;
  isHalal: boolean;
  qualityTier: number;
  currentPrice: PriceDto | null;
}

export interface PriceDto {
  priceCents: number;
  wasPriceCents: number | null;
  isPromo: boolean;
  promoEndsAt: string | null;
  pricePerKgCents: number | null;
  pricePerLCents: number | null;
  pricePerPieceCents: number | null;
  effectiveAt: string;
}

export interface PriceComparisonRow {
  ingredientId: string;
  ingredientName: string;
  requiredQtyG: number | null;
  offers: Array<{
    product: ProductDto;
    storeCode: StoreCode;
    storeName: string;
    effectiveCostCents: number; // cost to satisfy required quantity
    similarity: number;
  }>;
}

// ---- Baskets ----

export interface BasketItemDto {
  id: string;
  ingredientName: string;
  requiredQtyG: number | null;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  isSubstitute: boolean;
  unmatched: boolean;
  checked: boolean;
  product: ProductDto | null;
}

export interface BasketDto {
  id: string;
  name: string;
  strategy: BasketStrategy;
  status: BasketStatus;
  totalCents: number;
  deliveryCents: number;
  storeCount: number;
  savingsCents: number;
  recipeId: string | null;
  items: BasketItemDto[];
  createdAt: string;
}

export interface OptimizationResult {
  strategy: BasketStrategy;
  totalCents: number;
  deliveryCents: number;
  grandTotalCents: number;
  storeCount: number;
  savingsCents: number;
  storeBreakdown: Array<{
    storeCode: StoreCode;
    storeName: string;
    itemCount: number;
    subtotalCents: number;
    deliveryCents: number;
  }>;
  items: Array<Omit<BasketItemDto, 'id' | 'checked'>>;
  unmatchedIngredients: string[];
}

// ---- Pantry ----

export interface PantryItemDto {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  location: PantryLocation;
  expiresAt: string | null;
  purchasedAt: string | null;
  daysUntilExpiry: number | null;
  ingredient: { id: string; displayName: string; category: IngredientCategory } | null;
}

// ---- Meal plans ----

export interface MealPlanSlotDto {
  id: string;
  date: string;
  mealType: MealType;
  servings: number;
  recipe: Pick<RecipeDto, 'id' | 'title' | 'imageUrl' | 'nutrition'> | null;
}

export interface MealPlanDto {
  id: string;
  name: string;
  period: MealPlanPeriod;
  startDate: string;
  endDate: string;
  budgetCents: number | null;
  targetCalories: number | null;
  targetProteinG: number | null;
  estimatedCostCents: number;
  slots: MealPlanSlotDto[];
}

// ---- Forecasting ----

export interface PriceForecastDto {
  productId: string;
  horizonDays: number;
  predictedPriceCents: number;
  direction: 'UP' | 'DOWN' | 'STABLE';
  promoLikelihood: number;
  confidence: number;
}

// ---- Analytics ----

export interface AnalyticsSummary {
  monthlySavingsCents: number;
  monthlySpendCents: number;
  spendByStore: Array<{ storeCode: StoreCode; storeName: string; totalCents: number }>;
  spendTrend: Array<{ month: string; totalCents: number; savedCents: number }>;
  inflationTrend: Array<{ month: string; indexValue: number }>;
  pantryWaste: { wastedItems: number; wastedValueCents: number; wasteRate: number };
}

// ---- Assistant ----

export interface ChatMessageDto {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface ChatSessionDto {
  id: string;
  title: string;
  messages: ChatMessageDto[];
  createdAt: string;
}

// ---- Notifications ----

export interface NotificationDto {
  id: string;
  type: AlertType;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}
