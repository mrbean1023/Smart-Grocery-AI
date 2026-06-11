import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma, SubmissionStatus } from '@prisma/client';
import type { PriceSubmission, StoreCode } from '@prisma/client';
import type { Paginated, PriceSubmissionInput } from '@smart-grocery/shared';
import type { AuthUser } from '../auth/types';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../metrics/metrics.service';
import { IngestionService } from '../ingestion/ingestion.service';

const SIMILARITY_THRESHOLD = 0.6;
const CONSENSUS_MIN_SUBMISSIONS = 3;
const CONSENSUS_PRICE_TOLERANCE = 0.15;
const CONSENSUS_WINDOW_DAYS = 14;

interface SimilarSubmissionRow {
  id: string;
  productName: string;
  priceCents: number;
  packSize: number | null;
  packUnit: string | null;
}

@Injectable()
export class PriceSubmissionsService {
  private readonly logger = new Logger(PriceSubmissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    @Inject(forwardRef(() => IngestionService))
    private readonly ingestion: IngestionService,
  ) {}

  async createSubmission(user: AuthUser, input: PriceSubmissionInput): Promise<PriceSubmission> {
    const submission = await this.prisma.priceSubmission.create({
      data: {
        userId: user.id,
        storeCode: input.storeCode,
        productName: input.productName.trim(),
        priceCents: input.priceCents,
        packSize: input.packSize ?? null,
        packUnit: input.packUnit ?? null,
        status: SubmissionStatus.PENDING,
      },
    });

    this.metrics.increment('price_submissions_created_total');

    try {
      await this.tryAutoApprove(submission.storeCode, submission.productName);
    } catch (err) {
      this.logger.warn(
        `Auto-approval check failed for submission ${submission.id}: ${(err as Error).message}`,
      );
    }

    return submission;
  }

  async listMine(user: AuthUser, page: number, pageSize: number): Promise<Paginated<PriceSubmission>> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.priceSubmission.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.priceSubmission.count({ where: { userId: user.id } }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  /**
   * Consensus auto-approval: when >= 3 PENDING submissions for the same store
   * and a trigram-similar product name exist within 14 days, and their prices
   * agree within 15% of the median, all are AUTO_APPROVED and the price is
   * applied as a CROWDSOURCED price point.
   */
  private async tryAutoApprove(storeCode: StoreCode, productName: string): Promise<void> {
    const group = await this.prisma.$queryRaw<SimilarSubmissionRow[]>(Prisma.sql`
      SELECT id, "productName", "priceCents", "packSize", "packUnit"
      FROM price_submissions
      WHERE "storeCode" = ${storeCode}::"StoreCode"
        AND status = 'PENDING'
        AND "createdAt" >= now() - make_interval(days => ${CONSENSUS_WINDOW_DAYS})
        AND similarity(lower("productName"), lower(${productName})) > ${SIMILARITY_THRESHOLD}
      ORDER BY "createdAt" DESC
    `);

    if (group.length < CONSENSUS_MIN_SUBMISSIONS) {
      return;
    }

    const prices = group.map((g) => g.priceCents).sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);
    const median =
      prices.length % 2 === 0 ? Math.round((prices[mid - 1] + prices[mid]) / 2) : prices[mid];

    const consensus = group.filter(
      (g) => Math.abs(g.priceCents - median) <= median * CONSENSUS_PRICE_TOLERANCE,
    );
    if (consensus.length < CONSENSUS_MIN_SUBMISSIONS) {
      return;
    }

    await this.prisma.priceSubmission.updateMany({
      where: { id: { in: consensus.map((c) => c.id) } },
      data: {
        status: SubmissionStatus.AUTO_APPROVED,
        reviewNote: `Auto-approved by consensus of ${consensus.length} submissions (median ${median} cents)`,
      },
    });

    const representative = consensus[0];
    await this.ingestion.applySubmission({
      storeCode,
      productName: representative.productName,
      priceCents: median,
      packSize: representative.packSize,
      packUnit: representative.packUnit,
    });

    this.metrics.increment('price_submissions_auto_approved_total');
    this.logger.log(
      `Auto-approved ${consensus.length} submissions for "${representative.productName}" at ${storeCode} (median ${median} cents)`,
    );
  }
}
