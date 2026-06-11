import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { z } from 'zod';
import type { Paginated, PriceForecastDto, ProductDto } from '@smart-grocery/shared';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { QuotaService } from '../billing/quota.service';
import { PriceForecastService } from '../forecasting/price-forecast.service';
import { ProductsService } from './products.service';

const STORE_CODES = [
  'FAIRPRICE',
  'SHENG_SIONG',
  'GIANT',
  'COLD_STORAGE',
  'PRIME',
  'REDMART',
  'AMAZON_FRESH',
] as const;

const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  stores: z
    .string()
    .optional()
    .transform((s) =>
      s
        ? s
            .split(',')
            .map((x) => x.trim().toUpperCase())
            .filter(Boolean)
        : undefined,
    )
    .pipe(z.array(z.enum(STORE_CODES)).max(7).optional()),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
type SearchQuery = z.infer<typeof searchQuerySchema>;

const historyQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(90),
});
type HistoryQuery = z.infer<typeof historyQuerySchema>;

@Controller('products')
export class ProductsController {
  constructor(
    private readonly products: ProductsService,
    private readonly quota: QuotaService,
    private readonly forecasts: PriceForecastService,
  ) {}

  @Public()
  @Get('search')
  async search(
    @Query(new ZodValidationPipe(searchQuerySchema)) query: SearchQuery,
  ): Promise<Paginated<ProductDto>> {
    return this.products.searchProducts({
      q: query.q,
      storeCodes: query.stores,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Public()
  @Get(':id')
  async getById(@Param('id', ParseUUIDPipe) id: string): Promise<ProductDto> {
    return this.products.getById(id);
  }

  @Public()
  @Get(':id/history')
  async getHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(historyQuerySchema)) query: HistoryQuery,
  ): Promise<Array<{ date: string; priceCents: number }>> {
    return this.products.getHistory(id, query.days);
  }

  @Get(':id/forecast')
  async getForecast(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PriceForecastDto[]> {
    await this.quota.assertPremium(user, 'price_forecasting');
    return this.forecasts.getForecastsForProduct(id);
  }
}
