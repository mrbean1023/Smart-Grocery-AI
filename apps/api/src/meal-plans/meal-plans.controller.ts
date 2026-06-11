import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import {
  generateMealPlanSchema,
  paginationSchema,
  type GenerateMealPlanInput,
  type MealPlanDto,
  type Paginated,
} from '@smart-grocery/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { MealPlansService, UpdateSlotInput } from './meal-plans.service';

const updateSlotSchema = z
  .object({
    recipeId: z.string().uuid().optional(),
    servings: z.number().int().min(1).max(20).optional(),
  })
  .refine((v) => v.recipeId !== undefined || v.servings !== undefined, {
    message: 'Provide recipeId and/or servings',
  });

type PaginationQuery = z.infer<typeof paginationSchema>;

@Controller('meal-plans')
export class MealPlansController {
  constructor(private readonly mealPlans: MealPlansService) {}

  @Post('generate')
  generate(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(generateMealPlanSchema)) body: GenerateMealPlanInput,
  ): Promise<MealPlanDto> {
    return this.mealPlans.generate(user, body);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(paginationSchema)) query: PaginationQuery,
  ): Promise<Paginated<MealPlanDto>> {
    return this.mealPlans.list(user.id, query.page, query.pageSize);
  }

  @Get(':id')
  getById(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<MealPlanDto> {
    return this.mealPlans.getById(user.id, id);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{ deleted: true }> {
    return this.mealPlans.remove(user.id, id);
  }

  @Patch(':id/slots/:slotId')
  updateSlot(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('slotId', new ParseUUIDPipe()) slotId: string,
    @Body(new ZodValidationPipe(updateSlotSchema)) body: UpdateSlotInput,
  ): Promise<MealPlanDto> {
    return this.mealPlans.updateSlot(user, id, slotId, body);
  }
}
