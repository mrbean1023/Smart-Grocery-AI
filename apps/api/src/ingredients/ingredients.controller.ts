import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  IngredientsService,
  type IngredientSearchRow,
  type SubstitutionRow,
} from './ingredients.service';

const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
});

type SearchQuery = z.infer<typeof searchQuerySchema>;

@Controller('ingredients')
export class IngredientsController {
  constructor(private readonly ingredients: IngredientsService) {}

  @Get('search')
  search(
    @Query(new ZodValidationPipe(searchQuerySchema)) query: SearchQuery,
  ): Promise<IngredientSearchRow[]> {
    return this.ingredients.search(query.q);
  }

  @Get(':id/substitutions')
  substitutions(@Param('id', ParseUUIDPipe) id: string): Promise<SubstitutionRow[]> {
    return this.ingredients.getSubstitutions(id);
  }
}
