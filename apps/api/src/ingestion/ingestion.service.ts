import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { IngestionStatus, IngestionType, PriceSource, Prisma } from '@prisma/client';
import type { IngestionRun, Product, StoreCode } from '@prisma/client';
import type { Paginated } from '@smart-grocery/shared';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { MetricsService } from '../metrics/metrics.service';
import { PricesService } from '../prices/prices.service';
import { CsvPriceAdapter } from './adapters/csv-price.adapter';
import { ExcelPriceAdapter } from './adapters/excel-price.adapter';
import { ApiFeedAdapter } from './adapters/api-feed.adapter';
import { mapPackUnit } from './adapters/row-mapper';
import type { PriceSourceAdapter, RawPriceRow } from './adapters/price-source-adapter.interface';

export interface RunImportOptions {
  storeCode: StoreCode;
  type: IngestionType;
  fileKey?: string;
  buffer?: Buffer;
  adapter: PriceSourceAdapter;
  /** Reuse an existing (PENDING) run record instead of creating a new one. */
  runId?: string;
}

export interface ApplySubmissionInput {
  storeCode: StoreCode;
  productName: string;
  priceCents: number;
  packSize?: number | null;
  packUnit?: string | null;
}

const MAX_COLLECTED_ERRORS = 50;

const TYPE_TO_PRICE_SOURCE: Record<IngestionType, PriceSource> = {
  [IngestionType.API]: PriceSource.API,
  [IngestionType.MERCHANT_FEED]: PriceSource.MERCHANT_FEED,
  [IngestionType.CSV]: PriceSource.CSV_IMPORT,
  [IngestionType.EXCEL]: PriceSource.EXCEL_IMPORT,
  [IngestionType.RECEIPT]: PriceSource.RECEIPT_OCR,
  [IngestionType.SEED]: PriceSource.SEED,
};

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly metrics: MetricsService,
    @Inject(forwardRef(() => PricesService))
    private readonly prices: PricesService,
    private readonly csvAdapter: CsvPriceAdapter,
    private readonly excelAdapter: ExcelPriceAdapter,
    private readonly apiFeedAdapter: ApiFeedAdapter,
    @InjectQueue('matching') private readonly matchingQueue: Queue,
  ) {}

  adapterFor(type: IngestionType): PriceSourceAdapter {
    switch (type) {
      case IngestionType.CSV:
        return this.csvAdapter;
      case IngestionType.EXCEL:
        return this.excelAdapter;
      case IngestionType.API:
      case IngestionType.MERCHANT_FEED:
        return this.apiFeedAdapter;
      default:
        throw new BadRequestException(`No price source adapter for ingestion type ${type}`);
    }
  }

  async createPendingRun(
    storeCode: StoreCode,
    type: IngestionType,
    fileKey: string,
  ): Promise<IngestionRun> {
    const store = await this.requireStore(storeCode);
    return this.prisma.ingestionRun.create({
      data: { storeId: store.id, type, status: IngestionStatus.PENDING, fileKey },
    });
  }

  /** Entry point for the queue processor. */
  async executeRun(runId: string): Promise<IngestionRun> {
    const run = await this.prisma.ingestionRun.findUnique({
      where: { id: runId },
      include: { store: true },
    });
    if (!run) {
      throw new NotFoundException(`Ingestion run ${runId} not found`);
    }
    if (!run.store) {
      throw new BadRequestException(`Ingestion run ${runId} has no store`);
    }
    return this.runImport({
      storeCode: run.store.code,
      type: run.type,
      fileKey: run.fileKey ?? undefined,
      adapter: this.adapterFor(run.type),
      runId: run.id,
    });
  }

  async runImport(opts: RunImportOptions): Promise<IngestionRun> {
    const store = await this.requireStore(opts.storeCode);

    let run: IngestionRun;
    if (opts.runId) {
      run = await this.prisma.ingestionRun.update({
        where: { id: opts.runId },
        data: { status: IngestionStatus.RUNNING, startedAt: new Date() },
      });
    } else {
      run = await this.prisma.ingestionRun.create({
        data: {
          storeId: store.id,
          type: opts.type,
          status: IngestionStatus.RUNNING,
          fileKey: opts.fileKey ?? null,
          startedAt: new Date(),
        },
      });
    }

    let successRows = 0;
    let errorRows = 0;
    const errors: Array<{ row: number; message: string }> = [];
    let totalRows = 0;

    try {
      let buffer = opts.buffer;
      if (!buffer) {
        if (!opts.fileKey) {
          throw new BadRequestException('runImport requires a buffer or a fileKey');
        }
        buffer = await this.storage.getObject(opts.fileKey);
      }

      const rows = await opts.adapter.parse(buffer, opts.storeCode);
      totalRows = rows.length;
      const source = TYPE_TO_PRICE_SOURCE[opts.type];

      for (let i = 0; i < rows.length; i++) {
        try {
          await this.processRow(store.id, rows[i], source);
          successRows++;
        } catch (err) {
          errorRows++;
          if (errors.length < MAX_COLLECTED_ERRORS) {
            errors.push({ row: i + 1, message: (err as Error).message });
          }
        }
      }

      const status =
        errorRows === 0
          ? IngestionStatus.COMPLETED
          : successRows > 0
            ? IngestionStatus.PARTIAL
            : IngestionStatus.FAILED;

      run = await this.prisma.ingestionRun.update({
        where: { id: run.id },
        data: {
          status,
          totalRows,
          successRows,
          errorRows,
          errors: errors.length > 0 ? (errors as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          finishedAt: new Date(),
        },
      });
    } catch (err) {
      this.logger.error(
        `Ingestion run ${run.id} failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
      run = await this.prisma.ingestionRun.update({
        where: { id: run.id },
        data: {
          status: IngestionStatus.FAILED,
          totalRows,
          successRows,
          errorRows,
          errors: [{ row: 0, message: (err as Error).message }] as unknown as Prisma.InputJsonValue,
          finishedAt: new Date(),
        },
      });
      this.metrics.increment('ingestion_runs_failed_total');
      return run;
    }

    this.metrics.increment('ingestion_runs_completed_total');
    this.metrics.observeHistogram('ingestion_run_rows', totalRows);
    this.logger.log(
      `Ingestion run ${run.id} (${opts.storeCode}/${opts.type}): ${successRows}/${totalRows} rows imported, ${errorRows} errors`,
    );
    return run;
  }

  private async processRow(storeId: string, row: RawPriceRow, source: PriceSource): Promise<void> {
    const { product, isNew, renamed } = await this.upsertProduct(storeId, row);

    await this.prices.recordPrice({
      productId: product.id,
      priceCents: row.priceCents,
      wasPriceCents: row.wasPriceCents ?? null,
      isPromo: row.isPromo ?? false,
      source,
    });

    if (isNew || renamed) {
      await this.matchingQueue.add(
        'match-product',
        { productId: product.id },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: true },
      );
    }
  }

  private async upsertProduct(
    storeId: string,
    row: RawPriceRow,
  ): Promise<{ product: Product; isNew: boolean; renamed: boolean }> {
    const data = {
      name: row.name,
      brand: row.brand ?? null,
      category: row.category ?? null,
      packSize: row.packSize,
      packUnit: row.packUnit,
      unitCount: row.unitCount ?? 1,
      imageUrl: row.imageUrl ?? null,
      isAvailable: true,
      ...(row.isOrganic !== undefined ? { isOrganic: row.isOrganic } : {}),
      ...(row.isHalal !== undefined ? { isHalal: row.isHalal } : {}),
      ...(row.qualityTier !== undefined ? { qualityTier: row.qualityTier } : {}),
    };

    let existing: Product | null = null;
    if (row.externalId) {
      existing = await this.prisma.product.findUnique({
        where: { storeId_externalId: { storeId, externalId: row.externalId } },
      });
    }
    if (!existing) {
      existing = await this.prisma.product.findFirst({
        where: { storeId, name: { equals: row.name, mode: 'insensitive' } },
      });
    }

    if (existing) {
      const renamed = existing.name !== row.name;
      const product = await this.prisma.product.update({
        where: { id: existing.id },
        data: { ...data, externalId: row.externalId ?? existing.externalId },
      });
      return { product, isNew: false, renamed };
    }

    const product = await this.prisma.product.create({
      data: { ...data, storeId, externalId: row.externalId ?? null },
    });
    return { product, isNew: true, renamed: false };
  }

  /**
   * Apply a crowdsourced price submission: create/update the product and
   * record a CROWDSOURCED price point with confidence 0.7.
   */
  async applySubmission(input: ApplySubmissionInput): Promise<void> {
    const store = await this.requireStore(input.storeCode);

    const packUnit = mapPackUnit(input.packUnit ?? undefined) ?? 'PIECE';
    const packSize = input.packSize && input.packSize > 0 ? input.packSize : 1;

    const row: RawPriceRow = {
      name: input.productName,
      packSize,
      packUnit,
      priceCents: input.priceCents,
    };

    // Preserve existing pack configuration when the product already exists.
    const existing = await this.prisma.product.findFirst({
      where: { storeId: store.id, name: { equals: input.productName, mode: 'insensitive' } },
    });

    let productId: string;
    if (existing) {
      productId = existing.id;
    } else {
      const { product } = await this.upsertProduct(store.id, row);
      productId = product.id;
      await this.matchingQueue.add(
        'match-product',
        { productId },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: true },
      );
    }

    await this.prices.recordPrice({
      productId,
      priceCents: input.priceCents,
      source: PriceSource.CROWDSOURCED,
      confidence: 0.7,
    });

    this.metrics.increment('ingestion_crowdsourced_prices_total');
  }

  async listRuns(page: number, pageSize: number): Promise<Paginated<IngestionRun>> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.ingestionRun.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { store: true },
      }),
      this.prisma.ingestionRun.count(),
    ]);
    return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  private async requireStore(code: StoreCode) {
    const store = await this.prisma.store.findUnique({ where: { code } });
    if (!store) {
      throw new NotFoundException(`Store ${code} not found`);
    }
    return store;
  }
}
