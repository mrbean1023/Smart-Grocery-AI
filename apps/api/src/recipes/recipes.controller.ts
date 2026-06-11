import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import {
  importUrlSchema,
  manualRecipeSchema,
  paginationSchema,
  pasteRecipeSchema,
  type ManualRecipeInput,
  type Paginated,
  type RecipeDto,
} from '@smart-grocery/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types';
import { RecipesService, type UpdateRecipeInput } from './recipes.service';

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const ALLOWED_UPLOAD_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
]);

const listRecipesQuerySchema = paginationSchema.extend({
  search: z.string().trim().min(1).max(200).optional(),
});
type ListRecipesQuery = z.infer<typeof listRecipesQuerySchema>;

const updateRecipeSchema = manualRecipeSchema.partial();
type UpdateRecipeBody = z.infer<typeof updateRecipeSchema>;

type ImportUrlBody = z.infer<typeof importUrlSchema>;
type PasteRecipeBody = z.infer<typeof pasteRecipeSchema>;

@Controller('recipes')
export class RecipesController {
  constructor(private readonly recipes: RecipesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listRecipesQuerySchema)) query: ListRecipesQuery,
  ): Promise<Paginated<RecipeDto>> {
    return this.recipes.list(user, query);
  }

  @Get(':id')
  getById(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RecipeDto> {
    return this.recipes.getById(user, id);
  }

  @Post()
  createManual(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(manualRecipeSchema)) body: ManualRecipeInput,
  ): Promise<RecipeDto> {
    return this.recipes.createManual(user, body);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_BYTES },
      fileFilter: (_req, file, callback) => {
        if (ALLOWED_UPLOAD_MIMES.has(file.mimetype)) {
          callback(null, true);
        } else {
          callback(
            new BadRequestException(
              `Unsupported file type "${file.mimetype}" — allowed: JPEG, PNG, WebP, HEIC, PDF`,
            ),
            false,
          );
        }
      },
    }),
  )
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<RecipeDto> {
    if (!file) {
      throw new BadRequestException('A "file" upload is required');
    }
    return this.recipes.upload(user, file);
  }

  @Post('import-url')
  importUrl(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(importUrlSchema)) body: ImportUrlBody,
  ): Promise<RecipeDto> {
    return this.recipes.importUrl(user, body.url);
  }

  @Post('paste')
  paste(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(pasteRecipeSchema)) body: PasteRecipeBody,
  ): Promise<RecipeDto> {
    return this.recipes.paste(user, body.text);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateRecipeSchema)) body: UpdateRecipeBody,
  ): Promise<RecipeDto> {
    return this.recipes.update(user, id, body as UpdateRecipeInput);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.recipes.softDelete(user, id);
  }

  @Post(':id/reprocess')
  reprocess(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RecipeDto> {
    return this.recipes.reprocess(user, id);
  }
}
