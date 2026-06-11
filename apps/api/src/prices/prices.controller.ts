import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  paginationSchema,
  priceSubmissionSchema,
  type PriceComparisonRow,
  type PriceSubmissionInput,
} from '@smart-grocery/shared';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PriceComparisonService } from './price-comparison.service';
import { PriceSubmissionsService } from './price-submissions.service';

const compareQuerySchema = z.object({
  ingredientIds: z
    .string()
    .min(1)
    .transform((s) =>
      s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().uuid()).min(1).max(50)),
  qtyG: z.coerce.number().positive().max(1_000_000).optional(),
});
type CompareQuery = z.infer<typeof compareQuerySchema>;

type PaginationQuery = z.infer<typeof paginationSchema>;

@Controller('prices')
export class PricesController {
  constructor(
    private readonly comparison: PriceComparisonService,
    private readonly submissions: PriceSubmissionsService,
  ) {}

  @Public()
  @Get('compare')
  async compare(
    @Query(new ZodValidationPipe(compareQuerySchema)) query: CompareQuery,
  ): Promise<PriceComparisonRow[]> {
    return this.comparison.compare(query.ingredientIds, query.qtyG);
  }

  @Post('submissions')
  async createSubmission(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(priceSubmissionSchema)) body: PriceSubmissionInput,
  ) {
    return this.submissions.createSubmission(user, body);
  }

  @Get('submissions/mine')
  async listMine(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(paginationSchema)) query: PaginationQuery,
  ) {
    return this.submissions.listMine(user, query.page, query.pageSize);
  }
}
