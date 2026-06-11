import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';
import { PrismaService } from '../prisma/prisma.service';

export interface ProductSearchDoc {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  storeCode: string;
  isAvailable: boolean;
  priceCents: number | null;
  pricePerKgCents: number | null;
}

export interface ProductSearchOptions {
  q: string;
  storeCodes?: string[];
  page: number;
  pageSize: number;
}

const PRODUCTS_INDEX = 'products';
const RETRY_INTERVAL_MS = 60_000;

@Injectable()
export class SearchService implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SearchService.name);
  private client: Client | null = null;
  private available = false;
  private retryTimer: NodeJS.Timeout | null = null;
  private syncing = false;

  constructor(private readonly prisma: PrismaService) {}

  get isAvailable(): boolean {
    return this.available;
  }

  async onModuleInit(): Promise<void> {
    const node = process.env.ELASTICSEARCH_NODE;
    if (!node) {
      this.logger.warn(
        'ELASTICSEARCH_NODE is not configured — product search will fall back to Postgres',
      );
      return;
    }
    this.client = new Client({ node });
    await this.ensureIndices();
  }

  onApplicationBootstrap(): void {
    // Self-heal: reconcile the index with Postgres without blocking startup.
    void this.syncIndexFromDatabase();
  }

  onModuleDestroy(): void {
    this.clearRetry();
  }

  /**
   * Reconcile the products index with Postgres. Bulk-indexes everything when
   * the index has fewer documents than the database (fresh environments,
   * post-seed, or after an Elasticsearch wipe). Safe to call repeatedly.
   */
  async syncIndexFromDatabase(): Promise<void> {
    if (!this.available || !this.client || this.syncing) {
      return;
    }
    this.syncing = true;
    try {
      const dbCount = await this.prisma.product.count();
      if (dbCount === 0) {
        return;
      }
      await this.client.indices.refresh({ index: PRODUCTS_INDEX });
      const esCount = (await this.client.count({ index: PRODUCTS_INDEX })).count;
      if (esCount >= dbCount) {
        return;
      }
      this.logger.log(`Index out of date (${esCount}/${dbCount} docs) — reindexing products…`);

      const BATCH = 500;
      let indexed = 0;
      for (let skip = 0; skip < dbCount; skip += BATCH) {
        const products = await this.prisma.product.findMany({
          skip,
          take: BATCH,
          orderBy: { createdAt: 'asc' },
          include: { store: { select: { code: true } } },
        });
        if (products.length === 0) {
          break;
        }
        const latest = await this.prisma.$queryRaw<
          Array<{ product_id: string; price_cents: number; price_per_kg_cents: number | null }>
        >`SELECT DISTINCT ON ("productId") "productId" AS product_id, "priceCents" AS price_cents, "pricePerKgCents" AS price_per_kg_cents
          FROM prices WHERE "productId" = ANY(${products.map((p) => p.id)}::uuid[])
          ORDER BY "productId", "effectiveAt" DESC`;
        const priceMap = new Map(latest.map((r) => [r.product_id, r]));
        await this.indexProducts(
          products.map((p) => ({
            id: p.id,
            name: p.name,
            brand: p.brand,
            category: p.category,
            storeCode: p.store.code,
            isAvailable: p.isAvailable,
            priceCents: priceMap.get(p.id)?.price_cents ?? null,
            pricePerKgCents: priceMap.get(p.id)?.price_per_kg_cents ?? null,
          })),
        );
        indexed += products.length;
      }
      await this.client.indices.refresh({ index: PRODUCTS_INDEX });
      this.logger.log(`Reindexed ${indexed} products into Elasticsearch`);
    } catch (err) {
      this.logger.warn(`Index sync failed: ${(err as Error).message}`);
    } finally {
      this.syncing = false;
    }
  }

  async ensureIndices(): Promise<void> {
    if (!this.client) {
      return;
    }
    try {
      const exists = await this.client.indices.exists({ index: PRODUCTS_INDEX });
      if (!exists) {
        await this.client.indices.create({
          index: PRODUCTS_INDEX,
          mappings: {
            properties: {
              name: { type: 'text', fields: { keyword: { type: 'keyword' } } },
              brand: { type: 'text' },
              category: { type: 'text' },
              storeCode: { type: 'keyword' },
              isAvailable: { type: 'boolean' },
              priceCents: { type: 'integer' },
              pricePerKgCents: { type: 'integer' },
            },
          },
        });
        this.logger.log(`Created Elasticsearch index "${PRODUCTS_INDEX}"`);
      }
      const cameBack = !this.available;
      this.available = true;
      this.clearRetry();
      this.logger.log('Elasticsearch is available');
      if (cameBack) {
        // Re-sync after an outage or first connect (no-op when already current).
        void this.syncIndexFromDatabase();
      }
    } catch (err) {
      this.available = false;
      this.logger.warn(
        `Elasticsearch unavailable (${(err as Error).message}) — falling back to Postgres search, retrying in ${RETRY_INTERVAL_MS / 1000}s`,
      );
      this.scheduleRetry();
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer) {
      return;
    }
    this.retryTimer = setInterval(() => {
      void this.ensureIndices();
    }, RETRY_INTERVAL_MS);
    // Do not keep the process alive just for retries.
    if (typeof this.retryTimer.unref === 'function') {
      this.retryTimer.unref();
    }
  }

  private clearRetry(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /** Bulk index product documents. Silent no-op when Elasticsearch is down. */
  async indexProducts(docs: ProductSearchDoc[]): Promise<void> {
    if (!this.available || !this.client || docs.length === 0) {
      return;
    }
    try {
      const operations = docs.flatMap((doc) => [
        { index: { _index: PRODUCTS_INDEX, _id: doc.id } },
        doc,
      ]);
      const result = await this.client.bulk({ operations, refresh: false });
      if (result.errors) {
        const failed = result.items.filter((item) => item.index?.error).length;
        this.logger.warn(`Bulk index completed with ${failed}/${docs.length} failed documents`);
      }
    } catch (err) {
      this.available = false;
      this.logger.warn(`Failed to index products in Elasticsearch: ${(err as Error).message}`);
      this.scheduleRetry();
    }
  }

  /**
   * Full-text product search. Returns null when Elasticsearch is unavailable so
   * callers can fall back to Postgres.
   */
  async searchProducts(
    opts: ProductSearchOptions,
  ): Promise<{ ids: string[]; total: number } | null> {
    if (!this.available || !this.client) {
      return null;
    }
    try {
      const filter: Array<Record<string, unknown>> = [{ term: { isAvailable: true } }];
      if (opts.storeCodes && opts.storeCodes.length > 0) {
        filter.push({ terms: { storeCode: opts.storeCodes } });
      }
      const result = await this.client.search<ProductSearchDoc>({
        index: PRODUCTS_INDEX,
        from: (opts.page - 1) * opts.pageSize,
        size: opts.pageSize,
        query: {
          bool: {
            must: [
              {
                multi_match: {
                  query: opts.q,
                  fields: ['name^3', 'brand', 'category'],
                  fuzziness: 'AUTO',
                },
              },
            ],
            filter,
          },
        },
      });
      const totalRaw = result.hits.total;
      const total =
        typeof totalRaw === 'number' ? totalRaw : (totalRaw?.value ?? result.hits.hits.length);
      const ids = result.hits.hits.map((hit) => String(hit._id));
      return { ids, total };
    } catch (err) {
      this.available = false;
      this.logger.warn(`Elasticsearch search failed: ${(err as Error).message}`);
      this.scheduleRetry();
      return null;
    }
  }
}
