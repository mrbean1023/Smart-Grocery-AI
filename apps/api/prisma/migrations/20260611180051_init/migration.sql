-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN', 'MODERATOR');

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('FREE', 'PREMIUM');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED', 'TRIALING', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "VerificationTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "UsageKind" AS ENUM ('RECIPE_SCAN', 'BASKET_OPTIMIZATION', 'AI_CHAT_MESSAGE', 'OCR_UPLOAD');

-- CreateEnum
CREATE TYPE "IngredientCategory" AS ENUM ('PRODUCE', 'MEAT', 'SEAFOOD', 'DAIRY', 'EGGS', 'GRAINS', 'BAKERY', 'CANNED', 'FROZEN', 'CONDIMENTS', 'SPICES', 'OILS', 'BEVERAGES', 'SNACKS', 'NOODLES_PASTA', 'TOFU_SOY', 'SAUCES', 'BAKING', 'OTHER');

-- CreateEnum
CREATE TYPE "RecipeSource" AS ENUM ('MANUAL', 'IMAGE_OCR', 'PDF_OCR', 'URL_IMPORT', 'AI_GENERATED');

-- CreateEnum
CREATE TYPE "RecipeStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "StoreCode" AS ENUM ('FAIRPRICE', 'SHENG_SIONG', 'GIANT', 'COLD_STORAGE', 'PRIME', 'REDMART', 'AMAZON_FRESH');

-- CreateEnum
CREATE TYPE "ProductUnit" AS ENUM ('G', 'KG', 'ML', 'L', 'PIECE', 'PACK');

-- CreateEnum
CREATE TYPE "PriceSource" AS ENUM ('SEED', 'API', 'MERCHANT_FEED', 'CSV_IMPORT', 'EXCEL_IMPORT', 'RECEIPT_OCR', 'CROWDSOURCED');

-- CreateEnum
CREATE TYPE "IngestionType" AS ENUM ('API', 'MERCHANT_FEED', 'CSV', 'EXCEL', 'RECEIPT', 'SEED');

-- CreateEnum
CREATE TYPE "IngestionStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'COMPLETED', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'AUTO_APPROVED');

-- CreateEnum
CREATE TYPE "BasketStrategy" AS ENUM ('CHEAPEST', 'CONVENIENCE', 'DELIVERY', 'QUALITY');

-- CreateEnum
CREATE TYPE "BasketStatus" AS ENUM ('DRAFT', 'OPTIMIZED', 'PURCHASED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PantryLocation" AS ENUM ('PANTRY', 'FRIDGE', 'FREEZER');

-- CreateEnum
CREATE TYPE "MealPlanPeriod" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "MealType" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('PRICE_DROP', 'PROMOTION', 'EXPIRING_INGREDIENT', 'BUDGET_OVERRUN');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "passwordHash" TEXT,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "googleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "dietaryRestrictions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allergies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "householdSize" INTEGER NOT NULL DEFAULT 1,
    "weeklyBudgetCents" INTEGER,
    "preferredStores" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "nutritionGoals" JSONB,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "type" "VerificationTokenType" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tier" "SubscriptionTier" NOT NULL DEFAULT 'FREE',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripePriceId" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_records" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "UsageKind" NOT NULL,
    "periodKey" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredients" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "category" "IngredientCategory" NOT NULL DEFAULT 'OTHER',
    "defaultUnit" TEXT NOT NULL DEFAULT 'g',
    "density" DOUBLE PRECISION,
    "gramsPerPiece" DOUBLE PRECISION,
    "imageUrl" TEXT,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredient_aliases" (
    "id" UUID NOT NULL,
    "ingredientId" UUID NOT NULL,
    "alias" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en-SG',

    CONSTRAINT "ingredient_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredient_nutrition" (
    "id" UUID NOT NULL,
    "ingredientId" UUID NOT NULL,
    "calories" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "proteinG" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "carbsG" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fatG" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fibreG" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sodiumMg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sugarG" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'seed',

    CONSTRAINT "ingredient_nutrition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredient_substitutions" (
    "id" UUID NOT NULL,
    "fromIngredientId" UUID NOT NULL,
    "toIngredientId" UUID NOT NULL,
    "ratio" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "notes" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.8,

    CONSTRAINT "ingredient_substitutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipes" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "source" "RecipeSource" NOT NULL DEFAULT 'MANUAL',
    "status" "RecipeStatus" NOT NULL DEFAULT 'READY',
    "sourceUrl" TEXT,
    "imageUrl" TEXT,
    "rawText" TEXT,
    "servings" INTEGER NOT NULL DEFAULT 2,
    "prepMinutes" INTEGER,
    "cookMinutes" INTEGER,
    "instructions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cuisine" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "failureReason" TEXT,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_ingredients" (
    "id" UUID NOT NULL,
    "recipeId" UUID NOT NULL,
    "ingredientId" UUID,
    "rawText" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION,
    "unit" TEXT,
    "normalizedQtyG" DOUBLE PRECISION,
    "optional" BOOLEAN NOT NULL DEFAULT false,
    "matchConfidence" DOUBLE PRECISION,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_nutrition" (
    "id" UUID NOT NULL,
    "recipeId" UUID NOT NULL,
    "calories" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "proteinG" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "carbsG" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fatG" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fibreG" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sodiumMg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sugarG" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "healthScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipe_nutrition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" UUID NOT NULL,
    "code" "StoreCode" NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "websiteUrl" TEXT,
    "supportsDelivery" BOOLEAN NOT NULL DEFAULT true,
    "deliveryFeeCents" INTEGER NOT NULL DEFAULT 0,
    "freeDeliveryMinCents" INTEGER,
    "minOrderCents" INTEGER NOT NULL DEFAULT 0,
    "avgDeliveryDays" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "qualityScore" DOUBLE PRECISION NOT NULL DEFAULT 3.5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "description" TEXT,
    "imageUrl" TEXT,
    "category" TEXT,
    "packSize" DOUBLE PRECISION NOT NULL,
    "packUnit" "ProductUnit" NOT NULL,
    "unitCount" INTEGER NOT NULL DEFAULT 1,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "isOrganic" BOOLEAN NOT NULL DEFAULT false,
    "isHalal" BOOLEAN NOT NULL DEFAULT false,
    "qualityTier" INTEGER NOT NULL DEFAULT 2,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_ingredient_matches" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "ingredientId" UUID NOT NULL,
    "similarity" DOUBLE PRECISION NOT NULL,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "matchedBy" TEXT NOT NULL DEFAULT 'embedding',

    CONSTRAINT "product_ingredient_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prices" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "wasPriceCents" INTEGER,
    "isPromo" BOOLEAN NOT NULL DEFAULT false,
    "promoEndsAt" TIMESTAMP(3),
    "source" "PriceSource" NOT NULL DEFAULT 'SEED',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "pricePerKgCents" INTEGER,
    "pricePerLCents" INTEGER,
    "pricePerPieceCents" INTEGER,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_forecasts" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "horizonDays" INTEGER NOT NULL,
    "predictedPriceCents" INTEGER NOT NULL,
    "direction" TEXT NOT NULL,
    "promoLikelihood" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "modelVersion" TEXT NOT NULL DEFAULT 'v1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_runs" (
    "id" UUID NOT NULL,
    "storeId" UUID,
    "type" "IngestionType" NOT NULL,
    "status" "IngestionStatus" NOT NULL DEFAULT 'PENDING',
    "fileKey" TEXT,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "successRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingestion_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_uploads" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "fileKey" TEXT NOT NULL,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'UPLOADED',
    "storeCode" "StoreCode",
    "receiptDate" TIMESTAMP(3),
    "totalCents" INTEGER,
    "rawOcrText" TEXT,
    "parsedItems" JSONB,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receipt_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_submissions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "receiptId" UUID,
    "storeCode" "StoreCode" NOT NULL,
    "productName" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "packSize" DOUBLE PRECISION,
    "packUnit" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "baskets" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "recipeId" UUID,
    "name" TEXT NOT NULL,
    "strategy" "BasketStrategy" NOT NULL DEFAULT 'CHEAPEST',
    "status" "BasketStatus" NOT NULL DEFAULT 'DRAFT',
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "deliveryCents" INTEGER NOT NULL DEFAULT 0,
    "storeCount" INTEGER NOT NULL DEFAULT 0,
    "savingsCents" INTEGER NOT NULL DEFAULT 0,
    "optimizationMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "baskets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "basket_items" (
    "id" UUID NOT NULL,
    "basketId" UUID NOT NULL,
    "productId" UUID,
    "ingredientName" TEXT NOT NULL,
    "requiredQtyG" DOUBLE PRECISION,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "isSubstitute" BOOLEAN NOT NULL DEFAULT false,
    "unmatched" BOOLEAN NOT NULL DEFAULT false,
    "checked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "basket_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pantry_items" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "ingredientId" UUID,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "location" "PantryLocation" NOT NULL DEFAULT 'PANTRY',
    "expiresAt" TIMESTAMP(3),
    "purchasedAt" TIMESTAMP(3),
    "pricePaidCents" INTEGER,
    "consumedAt" TIMESTAMP(3),
    "wasted" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pantry_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pantry_usage_logs" (
    "id" UUID NOT NULL,
    "pantryItemId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "quantityDelta" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pantry_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_plans" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "period" "MealPlanPeriod" NOT NULL DEFAULT 'WEEKLY',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "budgetCents" INTEGER,
    "targetCalories" INTEGER,
    "targetProteinG" INTEGER,
    "dietaryRestrictions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estimatedCostCents" INTEGER NOT NULL DEFAULT 0,
    "generationMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meal_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_plan_slots" (
    "id" UUID NOT NULL,
    "mealPlanId" UUID NOT NULL,
    "recipeId" UUID,
    "date" DATE NOT NULL,
    "mealType" "MealType" NOT NULL,
    "servings" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,

    CONSTRAINT "meal_plan_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "AlertType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "threshold" DOUBLE PRECISION,
    "channel" TEXT NOT NULL DEFAULT 'in_app',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_watches" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "targetPriceCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_watches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "AlertType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New conversation',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "toolCalls" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_tokenHash_key" ON "verification_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "verification_tokens_userId_type_idx" ON "verification_tokens"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_userId_key" ON "subscriptions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripeCustomerId_key" ON "subscriptions"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripeSubscriptionId_key" ON "subscriptions"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "usage_records_userId_kind_periodKey_key" ON "usage_records"("userId", "kind", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "ingredients_name_key" ON "ingredients"("name");

-- CreateIndex
CREATE INDEX "ingredients_category_idx" ON "ingredients"("category");

-- CreateIndex
CREATE UNIQUE INDEX "ingredient_aliases_alias_key" ON "ingredient_aliases"("alias");

-- CreateIndex
CREATE INDEX "ingredient_aliases_ingredientId_idx" ON "ingredient_aliases"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "ingredient_nutrition_ingredientId_key" ON "ingredient_nutrition"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "ingredient_substitutions_fromIngredientId_toIngredientId_key" ON "ingredient_substitutions"("fromIngredientId", "toIngredientId");

-- CreateIndex
CREATE INDEX "recipes_userId_idx" ON "recipes"("userId");

-- CreateIndex
CREATE INDEX "recipes_status_idx" ON "recipes"("status");

-- CreateIndex
CREATE INDEX "recipes_isPublic_idx" ON "recipes"("isPublic");

-- CreateIndex
CREATE INDEX "recipe_ingredients_recipeId_idx" ON "recipe_ingredients"("recipeId");

-- CreateIndex
CREATE INDEX "recipe_ingredients_ingredientId_idx" ON "recipe_ingredients"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_nutrition_recipeId_key" ON "recipe_nutrition"("recipeId");

-- CreateIndex
CREATE UNIQUE INDEX "stores_code_key" ON "stores"("code");

-- CreateIndex
CREATE INDEX "products_storeId_idx" ON "products"("storeId");

-- CreateIndex
CREATE INDEX "products_name_idx" ON "products"("name");

-- CreateIndex
CREATE UNIQUE INDEX "products_storeId_externalId_key" ON "products"("storeId", "externalId");

-- CreateIndex
CREATE INDEX "product_ingredient_matches_ingredientId_similarity_idx" ON "product_ingredient_matches"("ingredientId", "similarity");

-- CreateIndex
CREATE UNIQUE INDEX "product_ingredient_matches_productId_ingredientId_key" ON "product_ingredient_matches"("productId", "ingredientId");

-- CreateIndex
CREATE INDEX "prices_productId_effectiveAt_idx" ON "prices"("productId", "effectiveAt" DESC);

-- CreateIndex
CREATE INDEX "prices_isPromo_idx" ON "prices"("isPromo");

-- CreateIndex
CREATE INDEX "price_forecasts_productId_idx" ON "price_forecasts"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "price_forecasts_productId_horizonDays_key" ON "price_forecasts"("productId", "horizonDays");

-- CreateIndex
CREATE INDEX "ingestion_runs_status_idx" ON "ingestion_runs"("status");

-- CreateIndex
CREATE INDEX "receipt_uploads_userId_idx" ON "receipt_uploads"("userId");

-- CreateIndex
CREATE INDEX "receipt_uploads_status_idx" ON "receipt_uploads"("status");

-- CreateIndex
CREATE INDEX "price_submissions_status_idx" ON "price_submissions"("status");

-- CreateIndex
CREATE INDEX "price_submissions_userId_idx" ON "price_submissions"("userId");

-- CreateIndex
CREATE INDEX "baskets_userId_idx" ON "baskets"("userId");

-- CreateIndex
CREATE INDEX "basket_items_basketId_idx" ON "basket_items"("basketId");

-- CreateIndex
CREATE INDEX "pantry_items_userId_idx" ON "pantry_items"("userId");

-- CreateIndex
CREATE INDEX "pantry_items_userId_expiresAt_idx" ON "pantry_items"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "pantry_usage_logs_pantryItemId_idx" ON "pantry_usage_logs"("pantryItemId");

-- CreateIndex
CREATE INDEX "meal_plans_userId_idx" ON "meal_plans"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "meal_plan_slots_mealPlanId_date_mealType_key" ON "meal_plan_slots"("mealPlanId", "date", "mealType");

-- CreateIndex
CREATE UNIQUE INDEX "alerts_userId_type_key" ON "alerts"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "price_watches_userId_productId_key" ON "price_watches"("userId", "productId");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");

-- CreateIndex
CREATE INDEX "chat_sessions_userId_idx" ON "chat_sessions"("userId");

-- CreateIndex
CREATE INDEX "chat_messages_sessionId_idx" ON "chat_messages"("sessionId");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_aliases" ADD CONSTRAINT "ingredient_aliases_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_nutrition" ADD CONSTRAINT "ingredient_nutrition_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_substitutions" ADD CONSTRAINT "ingredient_substitutions_fromIngredientId_fkey" FOREIGN KEY ("fromIngredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_substitutions" ADD CONSTRAINT "ingredient_substitutions_toIngredientId_fkey" FOREIGN KEY ("toIngredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_nutrition" ADD CONSTRAINT "recipe_nutrition_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_ingredient_matches" ADD CONSTRAINT "product_ingredient_matches_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_ingredient_matches" ADD CONSTRAINT "product_ingredient_matches_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prices" ADD CONSTRAINT "prices_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_runs" ADD CONSTRAINT "ingestion_runs_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_uploads" ADD CONSTRAINT "receipt_uploads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_submissions" ADD CONSTRAINT "price_submissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_submissions" ADD CONSTRAINT "price_submissions_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "receipt_uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "baskets" ADD CONSTRAINT "baskets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "baskets" ADD CONSTRAINT "baskets_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "basket_items" ADD CONSTRAINT "basket_items_basketId_fkey" FOREIGN KEY ("basketId") REFERENCES "baskets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "basket_items" ADD CONSTRAINT "basket_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pantry_items" ADD CONSTRAINT "pantry_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pantry_items" ADD CONSTRAINT "pantry_items_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pantry_usage_logs" ADD CONSTRAINT "pantry_usage_logs_pantryItemId_fkey" FOREIGN KEY ("pantryItemId") REFERENCES "pantry_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plan_slots" ADD CONSTRAINT "meal_plan_slots_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "meal_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plan_slots" ADD CONSTRAINT "meal_plan_slots_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_watches" ADD CONSTRAINT "price_watches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_watches" ADD CONSTRAINT "price_watches_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
