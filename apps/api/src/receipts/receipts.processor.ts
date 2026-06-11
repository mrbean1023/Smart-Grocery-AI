import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Prisma, ReceiptStatus, SubmissionStatus } from '@prisma/client';
import type { StoreCode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { OcrService } from '../ocr/ocr.service';
import { OpenAiService } from '../ai/openai.service';
import { MetricsService } from '../metrics/metrics.service';
import { parseReceiptText, type ParsedReceipt } from './receipt-parser';

export interface ReceiptJobData {
  receiptId: string;
}

const STORE_CODES: StoreCode[] = [
  'FAIRPRICE',
  'SHENG_SIONG',
  'GIANT',
  'COLD_STORAGE',
  'PRIME',
  'REDMART',
  'AMAZON_FRESH',
];

const EXTRACTION_SYSTEM_PROMPT = `You extract structured data from Singapore supermarket receipt text.
Respond ONLY with a JSON object of this exact shape:
{
  "storeCode": one of ["FAIRPRICE","SHENG_SIONG","GIANT","COLD_STORAGE","PRIME","REDMART","AMAZON_FRESH"] or null,
  "receiptDate": "YYYY-MM-DD" or null,
  "totalCents": integer total in cents or null,
  "items": [{ "name": string, "quantity": integer >= 1, "priceCents": integer, "packSize": number (optional), "packUnit": string (optional, e.g. "g","kg","ml","l","piece") }]
}
Rules: prices are in Singapore dollars on the receipt — convert to integer cents. Exclude totals, GST, payment, change and loyalty lines from items. Use null when unsure.`;

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
};

@Processor('receipt-processing')
export class ReceiptsProcessor extends WorkerHost {
  private readonly logger = new Logger(ReceiptsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ocr: OcrService,
    private readonly openai: OpenAiService,
    private readonly metrics: MetricsService,
  ) {
    super();
  }

  async process(job: Job<ReceiptJobData>): Promise<void> {
    const { receiptId } = job.data;
    const receipt = await this.prisma.receiptUpload.findUnique({ where: { id: receiptId } });
    if (!receipt) {
      this.logger.warn(`Receipt ${receiptId} no longer exists, skipping`);
      return;
    }

    try {
      await this.prisma.receiptUpload.update({
        where: { id: receiptId },
        data: { status: ReceiptStatus.PROCESSING, failureReason: null },
      });

      const buffer = await this.storage.getObject(receipt.fileKey);
      const ext = (receipt.fileKey.split('.').pop() ?? 'jpg').toLowerCase();
      const mime = MIME_BY_EXT[ext] ?? 'image/jpeg';

      const ocrText = await this.ocr.extractTextFromImage(buffer, mime);
      if (!ocrText || ocrText.trim().length < 10) {
        throw new Error('OCR produced no usable text');
      }

      const parsed = await this.extract(ocrText);
      const cleanItems = parsed.items
        .filter((i) => i.name && i.name.trim().length >= 2 && i.priceCents > 0)
        .map((i) => ({
          name: i.name.trim().slice(0, 200),
          quantity: Math.max(1, Math.round(i.quantity || 1)),
          priceCents: Math.round(i.priceCents),
          ...(i.packSize !== undefined ? { packSize: i.packSize } : {}),
          ...(i.packUnit !== undefined ? { packUnit: i.packUnit } : {}),
        }));

      const storeCode =
        parsed.storeCode && STORE_CODES.includes(parsed.storeCode) ? parsed.storeCode : null;
      const receiptDate =
        parsed.receiptDate && !Number.isNaN(Date.parse(parsed.receiptDate))
          ? new Date(parsed.receiptDate)
          : null;

      await this.prisma.receiptUpload.update({
        where: { id: receiptId },
        data: {
          status: ReceiptStatus.COMPLETED,
          storeCode,
          receiptDate,
          totalCents: parsed.totalCents,
          rawOcrText: ocrText.slice(0, 50_000),
          parsedItems: cleanItems as unknown as Prisma.InputJsonValue,
        },
      });

      if (storeCode && cleanItems.length > 0) {
        await this.prisma.priceSubmission.createMany({
          data: cleanItems.map((item) => ({
            userId: receipt.userId,
            receiptId: receipt.id,
            storeCode,
            productName: item.name,
            // priceCents is the line price; divide by quantity for unit price
            priceCents: Math.max(1, Math.round(item.priceCents / item.quantity)),
            packSize: item.packSize ?? null,
            packUnit: item.packUnit ?? null,
            status: SubmissionStatus.PENDING,
          })),
        });
      }

      this.metrics.increment('receipts_processed_total');
      this.logger.log(
        `Receipt ${receiptId} processed: ${cleanItems.length} items, store ${storeCode ?? 'unknown'}`,
      );
    } catch (err) {
      const message = (err as Error).message;
      const attempts = job.opts.attempts ?? 1;
      const isFinalAttempt = job.attemptsMade + 1 >= attempts;
      this.logger.error(
        `Receipt ${receiptId} processing failed (attempt ${job.attemptsMade + 1}/${attempts}): ${message}`,
      );
      if (isFinalAttempt) {
        await this.prisma.receiptUpload.update({
          where: { id: receiptId },
          data: { status: ReceiptStatus.FAILED, failureReason: message.slice(0, 500) },
        });
        this.metrics.increment('receipts_failed_total');
      }
      throw err;
    }
  }

  private async extract(ocrText: string): Promise<ParsedReceipt> {
    if (this.openai.isConfigured()) {
      try {
        const result = await this.openai.chatJson<ParsedReceipt>({
          system: EXTRACTION_SYSTEM_PROMPT,
          user: ocrText.slice(0, 12_000),
        });
        if (result && Array.isArray(result.items)) {
          return {
            storeCode: result.storeCode ?? null,
            receiptDate: result.receiptDate ?? null,
            totalCents:
              typeof result.totalCents === 'number' ? Math.round(result.totalCents) : null,
            items: result.items,
          };
        }
        this.logger.warn('AI extraction returned an unexpected shape, using regex fallback');
      } catch (err) {
        this.logger.warn(`AI extraction failed (${(err as Error).message}), using regex fallback`);
      }
    }
    return parseReceiptText(ocrText);
  }
}
