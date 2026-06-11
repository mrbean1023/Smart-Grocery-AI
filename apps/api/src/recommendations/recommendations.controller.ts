import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { RecommendationsService, RecipeRecommendationDto } from './recommendations.service';

const recommendRecipesQuerySchema = z.object({
  budgetCents: z.coerce.number().int().min(1).max(1_000_000).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

type RecommendRecipesQuery = z.infer<typeof recommendRecipesQuerySchema>;

@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}

  @Get('recipes')
  recipes(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(recommendRecipesQuerySchema)) query: RecommendRecipesQuery,
  ): Promise<RecipeRecommendationDto[]> {
    return this.recommendations.recommendRecipes(user, query.budgetCents, query.limit);
  }
}
