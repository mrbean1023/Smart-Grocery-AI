import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { z } from 'zod';
import { IngestionType } from '@prisma/client';
import { paginationSchema } from '@smart-grocery/shared';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { StorageService } from '../storage/storage.service';
import { IngestionService } from './ingestion.service';
import type { IngestionJobData } from './ingestion.processor';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

const uploadBodySchema = z.object({
  storeCode: z.enum([
    'FAIRPRICE',
    'SHENG_SIONG',
    'GIANT',
    'COLD_STORAGE',
    'PRIME',
    'REDMART',
    'AMAZON_FRESH',
  ]),
});
type UploadBody = z.infer<typeof uploadBodySchema>;

type PaginationQuery = z.infer<typeof paginationSchema>;

const EXTENSION_TO_TYPE: Record<string, IngestionType> = {
  csv: IngestionType.CSV,
  xlsx: IngestionType.EXCEL,
  json: IngestionType.API,
};

const ALLOWED_MIME_TYPES = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/json',
  'text/plain',
  'application/octet-stream',
]);

@Controller('ingestion')
@UseGuards(RolesGuard)
@Roles('ADMIN')
export class IngestionController {
  constructor(
    private readonly ingestion: IngestionService,
    private readonly storage: StorageService,
    @InjectQueue('ingestion') private readonly ingestionQueue: Queue<IngestionJobData>,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  async upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodValidationPipe(uploadBodySchema)) body: UploadBody,
  ) {
    if (!file) {
      throw new BadRequestException('A file is required (multipart field "file")');
    }
    const extension = (file.originalname.split('.').pop() ?? '').toLowerCase();
    const type = EXTENSION_TO_TYPE[extension];
    if (!type) {
      throw new BadRequestException('Only .csv, .xlsx and .json files are supported');
    }
    if (file.mimetype && !ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(`Unsupported content type ${file.mimetype}`);
    }

    const key = this.storage.buildKey(user.id, 'ingestion', file.originalname);
    await this.storage.upload({
      buffer: file.buffer,
      key,
      contentType: file.mimetype || 'application/octet-stream',
    });

    const run = await this.ingestion.createPendingRun(body.storeCode, type, key);
    await this.ingestionQueue.add(
      'import',
      { runId: run.id },
      { attempts: 3, backoff: { type: 'exponential', delay: 10_000 }, removeOnComplete: true },
    );
    return run;
  }

  @Get('runs')
  async listRuns(@Query(new ZodValidationPipe(paginationSchema)) query: PaginationQuery) {
    return this.ingestion.listRuns(query.page, query.pageSize);
  }
}
