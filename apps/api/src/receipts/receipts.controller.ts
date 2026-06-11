import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { paginationSchema } from '@smart-grocery/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { QuotaService } from '../billing/quota.service';
import { ReceiptsService } from './receipts.service';

const MAX_IMAGE_SIZE = 15 * 1024 * 1024; // 15 MB

type PaginationQuery = z.infer<typeof paginationSchema>;

@Controller('receipts')
export class ReceiptsController {
  constructor(
    private readonly receipts: ReceiptsService,
    private readonly quota: QuotaService,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_SIZE } }))
  async upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('A receipt image is required (multipart field "file")');
    }
    await this.quota.assertAndConsume(user, 'OCR_UPLOAD');
    return this.receipts.uploadReceipt(user, file);
  }

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(paginationSchema)) query: PaginationQuery,
  ) {
    return this.receipts.listMine(user, query.page, query.pageSize);
  }

  @Get(':id')
  async getOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.receipts.getOwn(user, id);
  }
}
