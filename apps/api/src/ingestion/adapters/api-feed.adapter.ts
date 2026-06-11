import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { IngestionType } from '@prisma/client';
import type { StoreCode } from '@prisma/client';
import type { PriceSourceAdapter, RawPriceRow } from './price-source-adapter.interface';
import { mapRecordToRow, RowMappingError } from './row-mapper';

/**
 * Generic JSON feed adapter: accepts a JSON array of product objects (or an
 * object wrapping the array under items/products/data/results) and applies
 * the same tolerant field mapping as the CSV/Excel adapters. Covers official
 * APIs and merchant feeds delivering JSON payloads.
 */
@Injectable()
export class ApiFeedAdapter implements PriceSourceAdapter {
  readonly type = IngestionType.API;
  private readonly logger = new Logger(ApiFeedAdapter.name);

  async parse(buffer: Buffer, storeCode: StoreCode): Promise<RawPriceRow[]> {
    let payload: unknown;
    try {
      payload = JSON.parse(buffer.toString('utf8'));
    } catch (err) {
      throw new BadRequestException(`Invalid JSON feed: ${(err as Error).message}`);
    }

    const records = this.extractRecords(payload);
    if (!records) {
      throw new BadRequestException(
        'JSON feed must be an array of products or wrap one under items/products/data/results',
      );
    }

    const rows: RawPriceRow[] = [];
    let skipped = 0;
    for (const record of records) {
      if (typeof record !== 'object' || record === null || Array.isArray(record)) {
        skipped++;
        continue;
      }
      try {
        rows.push(mapRecordToRow(record as Record<string, unknown>));
      } catch (err) {
        if (err instanceof RowMappingError) {
          skipped++;
          continue;
        }
        throw err;
      }
    }
    if (skipped > 0) {
      this.logger.warn(`JSON feed for ${storeCode}: skipped ${skipped} unmappable entries`);
    }
    return rows;
  }

  private extractRecords(payload: unknown): unknown[] | null {
    if (Array.isArray(payload)) {
      return payload;
    }
    if (typeof payload === 'object' && payload !== null) {
      const obj = payload as Record<string, unknown>;
      for (const key of ['items', 'products', 'data', 'results']) {
        if (Array.isArray(obj[key])) {
          return obj[key] as unknown[];
        }
      }
    }
    return null;
  }
}
