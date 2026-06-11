import { Module } from '@nestjs/common';
import type { DynamicModule, ForwardReference, Type } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { BillingModule } from './billing/billing.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { MailModule } from './mail/mail.module';
import { HttpMetricsInterceptor } from './metrics/http-metrics.interceptor';
import { MetricsModule } from './metrics/metrics.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule, redisConnectionFromUrl } from './redis/redis.module';
import { UsersModule } from './users/users.module';

import { AiModule } from './ai/ai.module';
import { AlertsModule } from './alerts/alerts.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AssistantModule } from './assistant/assistant.module';
import { BasketsModule } from './baskets/baskets.module';
import { ForecastingModule } from './forecasting/forecasting.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { IngredientsModule } from './ingredients/ingredients.module';
import { MatchingModule } from './matching/matching.module';
import { MealPlansModule } from './meal-plans/meal-plans.module';
import { NotificationsModule } from './notifications/notifications.module';
import { NutritionModule } from './nutrition/nutrition.module';
import { OcrModule } from './ocr/ocr.module';
import { PantryModule } from './pantry/pantry.module';
import { PricesModule } from './prices/prices.module';
import { ProductsModule } from './products/products.module';
import { ReceiptsModule } from './receipts/receipts.module';
import { RecipesModule } from './recipes/recipes.module';
import { RecommendationsModule } from './recommendations/recommendations.module';
import { SearchModule } from './search/search.module';
import { StorageModule } from './storage/storage.module';
import { StoresModule } from './stores/stores.module';

const FEATURE_MODULES: Array<Type<unknown> | DynamicModule | ForwardReference> = [
  // Cross-cutting (global) services
  AiModule,
  StorageModule,
  SearchModule,
  // Recipe intelligence
  OcrModule,
  IngredientsModule,
  NutritionModule,
  RecipesModule,
  // Pricing domain
  StoresModule,
  ProductsModule,
  PricesModule,
  IngestionModule,
  MatchingModule,
  ReceiptsModule,
  BasketsModule,
  ForecastingModule,
  // Lifestyle features
  PantryModule,
  MealPlansModule,
  RecommendationsModule,
  AssistantModule,
  NotificationsModule,
  AlertsModule,
  AnalyticsModule,
];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
      envFilePath: ['.env', '../../.env'],
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
    }),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          ...redisConnectionFromUrl(configService.getOrThrow<string>('redisUrl')),
          maxRetriesPerRequest: null,
        },
      }),
    }),
    // ---- Core infrastructure (all @Global) ----
    PrismaModule,
    RedisModule,
    MetricsModule,
    MailModule,
    // ---- Foundation feature modules ----
    AuthModule,
    UsersModule,
    BillingModule,
    HealthModule,
    // ---- Feature modules (appended by the integrator) ----
    ...FEATURE_MODULES,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
})
export class AppModule {}
