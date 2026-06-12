import { Injectable, Logger } from '@nestjs/common';
import { IngestionType } from '@prisma/client';
import type { StoreCode } from '@prisma/client';
import * as Papa from 'papaparse';
import type { PriceSourceAdapter, RawPriceRow } from './price-source-adapter.interface';
import { mapRecordToRow, RowMappingError } from './row-mapper';

@Injectable()
export class CsvPriceAdapter implements PriceSourceAdapter {
  readonly type = IngestionType.CSV;
  private readonly logger = new Logger(CsvPriceAdapter.name);

  async parse(buffer: Buffer, storeCode: StoreCode): Promise<RawPriceRow[]> {
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    const parsed = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(),
    });

    if (parsed.errors.length > 0) {
      this.logger.warn(
        `CSV parse for ${storeCode}: ${parsed.errors.length} parser warnings (first: ${parsed.errors[0].message})`,
      );
    }

    const rows: RawPriceRow[] = [];
    for (const record of parsed.data) {
      try {
        rows.push(mapRecordToRow(record));
      } catch (err) {
        if (err instanceof RowMappingError) {
          // Skip silently mapped-out rows; the ingestion service counts
          // per-row errors when records are re-validated there.
          continue;
        }
        throw err;
      }
    }
    return rows;
  }
}
