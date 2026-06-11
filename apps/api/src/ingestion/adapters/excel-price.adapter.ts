import { Injectable, Logger } from '@nestjs/common';
import { IngestionType } from '@prisma/client';
import type { StoreCode } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import type { PriceSourceAdapter, RawPriceRow } from './price-source-adapter.interface';
import { mapRecordToRow, RowMappingError } from './row-mapper';

@Injectable()
export class ExcelPriceAdapter implements PriceSourceAdapter {
  readonly type = IngestionType.EXCEL;
  private readonly logger = new Logger(ExcelPriceAdapter.name);

  async parse(buffer: Buffer, storeCode: StoreCode): Promise<RawPriceRow[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      this.logger.warn(`Excel file for ${storeCode} contains no worksheets`);
      return [];
    }

    const headers: string[] = [];
    worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
      headers[colNumber] = String(cell.value ?? '').trim();
    });

    const rows: RawPriceRow[] = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        return;
      }
      const record: Record<string, unknown> = {};
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const header = headers[colNumber];
        if (!header) {
          return;
        }
        let value: unknown = cell.value;
        if (value && typeof value === 'object') {
          const obj = value as { result?: unknown; text?: unknown; richText?: unknown };
          if (obj.result !== undefined) {
            value = obj.result; // formula cell
          } else if (typeof obj.text === 'string') {
            value = obj.text; // hyperlink / rich text
          } else if (Array.isArray(obj.richText)) {
            value = (obj.richText as Array<{ text: string }>).map((t) => t.text).join('');
          }
        }
        record[header] = value;
      });
      if (Object.keys(record).length === 0) {
        return;
      }
      try {
        rows.push(mapRecordToRow(record));
      } catch (err) {
        if (!(err instanceof RowMappingError)) {
          throw err;
        }
      }
    });
    return rows;
  }
}
