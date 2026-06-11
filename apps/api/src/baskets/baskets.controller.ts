import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import {
  optimizeBasketSchema,
  paginationSchema,
  type OptimizeBasketInput,
} from '@smart-grocery/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { QuotaService } from '../billing/quota.service';
import { BasketsService, type SaveBasketInput } from './baskets.service';

const strategyEnum = z.enum(['CHEAPEST', 'CONVENIENCE', 'DELIVERY', 'QUALITY']);

const storeCodeEnum = z.enum([
  'FAIRPRICE',
  'SHENG_SIONG',
  'GIANT',
  'COLD_STORAGE',
  'PRIME',
  'REDMART',
  'AMAZON_FRESH',
]);

const optimizationResultSchema = z.object({
  strategy: strategyEnum,
  totalCents: z.number().int().min(0),
  deliveryCents: z.number().int().min(0),
  grandTotalCents: z.number().int().min(0),
  storeCount: z.number().int().min(0),
  savingsCents: z.number().int().min(0),
  storeBreakdown: z.array(
    z.object({
      storeCode: storeCodeEnum,
      storeName: z.string(),
      itemCount: z.number().int().min(0),
      subtotalCents: z.number().int().min(0),
      deliveryCents: z.number().int().min(0),
    }),
  ),
  items: z.array(
    z.object({
      ingredientName: z.string().min(1).max(200),
      requiredQtyG: z.number().nullable(),
      quantity: z.number().int().min(0),
      unitPriceCents: z.number().int().min(0),
      totalCents: z.number().int().min(0),
      isSubstitute: z.boolean(),
      unmatched: z.boolean(),
      product: z.object({ id: z.string().uuid() }).passthrough().nullable(),
    }),
  ),
  unmatchedIngredients: z.array(z.string()),
});

const saveBasketSchema = z.object({
  name: z.string().min(1).max(120).trim(),
  strategy: strategyEnum,
  recipeId: z.string().uuid().optional(),
  result: optimizationResultSchema,
});

const updateBasketSchema = z.object({
  status: z.enum(['DRAFT', 'OPTIMIZED', 'PURCHASED', 'ARCHIVED']),
});
type UpdateBasketBody = z.infer<typeof updateBasketSchema>;

const updateItemSchema = z.object({
  checked: z.boolean(),
});
type UpdateItemBody = z.infer<typeof updateItemSchema>;

type PaginationQuery = z.infer<typeof paginationSchema>;

@Controller('baskets')
export class BasketsController {
  constructor(
    private readonly baskets: BasketsService,
    private readonly quota: QuotaService,
  ) {}

  @Post('optimize')
  async optimize(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(optimizeBasketSchema)) body: OptimizeBasketInput,
  ) {
    await this.quota.assertAndConsume(user, 'BASKET_OPTIMIZATION');
    return this.baskets.optimize(user, body);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(saveBasketSchema)) body: SaveBasketInput,
  ) {
    return this.baskets.saveBasket(user, body);
  }

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(paginationSchema)) query: PaginationQuery,
  ) {
    return this.baskets.listMine(user, query.page, query.pageSize);
  }

  @Get(':id')
  async getOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.baskets.getOwn(user, id);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateBasketSchema)) body: UpdateBasketBody,
  ) {
    return this.baskets.updateStatus(user, id, body.status);
  }

  /** Convenience endpoint to mark a basket as purchased (used by analytics). */
  @Post(':id/purchase')
  async markPurchased(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.baskets.updateStatus(user, id, 'PURCHASED');
  }

  @Patch(':id/items/:itemId')
  async updateItem(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body(new ZodValidationPipe(updateItemSchema)) body: UpdateItemBody,
  ) {
    return this.baskets.updateItemChecked(user, id, itemId, body.checked);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.baskets.deleteBasket(user, id);
  }
}
