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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import {
  createPantryItemSchema,
  updatePantryItemSchema,
  type CreatePantryItemInput,
  type PantryItemDto,
} from '@smart-grocery/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { PantryService, UpdatePantryItemInput } from './pantry.service';

const expiringQuerySchema = z.object({
  days: z.coerce.number().int().min(0).max(365).default(5),
});

type ExpiringQuery = z.infer<typeof expiringQuerySchema>;

@Controller('pantry')
export class PantryController {
  constructor(private readonly pantry: PantryService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<PantryItemDto[]> {
    return this.pantry.list(user.id);
  }

  @Get('expiring')
  expiring(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(expiringQuerySchema)) query: ExpiringQuery,
  ): Promise<PantryItemDto[]> {
    return this.pantry.getExpiring(user.id, query.days);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createPantryItemSchema)) body: CreatePantryItemInput,
  ): Promise<PantryItemDto> {
    return this.pantry.create(user.id, body, 'manual');
  }

  @Post('scan')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  scan(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: Record<string, unknown>,
  ): Promise<PantryItemDto[]> {
    const location = typeof body?.location === 'string' ? body.location : undefined;
    return this.pantry.scanPhoto(user, file, location);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updatePantryItemSchema)) body: UpdatePantryItemInput,
  ): Promise<PantryItemDto> {
    return this.pantry.update(user.id, id, body);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{ deleted: true }> {
    return this.pantry.remove(user.id, id);
  }
}
