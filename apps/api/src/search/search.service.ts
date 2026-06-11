import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';

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
export class SearchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SearchService.name);
  private client: Client | null = null;
  private available = false;
  private retryTimer: NodeJS.Timeout | null = null;

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

  onModuleDestroy(): void {
    this.clearRetry();
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
      this.available = true;
      this.clearRetry();
      this.logger.log('Elasticsearch is available');
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
