import type { StoreCode } from '@prisma/client';

export interface ParsedReceiptItem {
  name: string;
  quantity: number;
  priceCents: number;
  packSize?: number;
  packUnit?: string;
}

export interface ParsedReceipt {
  storeCode: StoreCode | null;
  receiptDate: string | null; // ISO date
  totalCents: number | null;
  items: ParsedReceiptItem[];
}

const STORE_KEYWORDS: Array<{ keywords: string[]; code: StoreCode }> = [
  { keywords: ['fairprice', 'ntuc', 'fair price'], code: 'FAIRPRICE' },
  { keywords: ['sheng siong', 'shengsiong'], code: 'SHENG_SIONG' },
  { keywords: ['cold storage', 'coldstorage'], code: 'COLD_STORAGE' },
  { keywords: ['giant'], code: 'GIANT' },
  { keywords: ['prime supermarket', 'prime mart', 'prime '], code: 'PRIME' },
  { keywords: ['redmart', 'red mart', 'lazada'], code: 'REDMART' },
  { keywords: ['amazon fresh', 'amazon.sg', 'amazon'], code: 'AMAZON_FRESH' },
];

export function detectStore(text: string): StoreCode | null {
  const lower = text.toLowerCase();
  for (const { keywords, code } of STORE_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) {
      return code;
    }
  }
  return null;
}

const NON_ITEM_PATTERNS =
  /^(total|subtotal|sub-total|grand total|gst|tax|change|cash|visa|master|nets|rounding|discount|savings|member|points|balance|tender|payment|amount due)/i;

const LINE_ITEM_RE = /^(.{2,60}?)\s+\$?\s?(\d{1,4}[.,]\d{2})\s*$/;
const QTY_PREFIX_RE = /^(\d{1,2})\s*[xX@]\s+/;
const TOTAL_LINE_RE = /(?:grand\s+)?total[^\d]*(\d{1,4}[.,]\d{2})/i;
const DATE_RE =
  /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})|(\d{4})-(\d{2})-(\d{2})/;

function toCents(text: string): number {
  return Math.round(parseFloat(text.replace(',', '.')) * 100);
}

/**
 * Regex fallback parser for when the AI extractor is not configured.
 * Parses `<name> <price>` lines, a total line, a date and the store banner.
 */
export function parseReceiptText(text: string): ParsedReceipt {
  const storeCode = detectStore(text);
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const items: ParsedReceiptItem[] = [];
  let totalCents: number | null = null;
  let receiptDate: string | null = null;

  for (const line of lines) {
    if (receiptDate === null) {
      const dateMatch = line.match(DATE_RE);
      if (dateMatch) {
        receiptDate = normalizeDate(dateMatch);
      }
    }

    const totalMatch = line.match(TOTAL_LINE_RE);
    if (totalMatch) {
      totalCents = toCents(totalMatch[1]);
      continue;
    }

    if (NON_ITEM_PATTERNS.test(line)) {
      continue;
    }

    const itemMatch = line.match(LINE_ITEM_RE);
    if (!itemMatch) {
      continue;
    }
    let name = itemMatch[1].trim();
    const priceCents = toCents(itemMatch[2]);
    if (priceCents <= 0 || priceCents > 500_00) {
      continue;
    }

    let quantity = 1;
    const qtyMatch = name.match(QTY_PREFIX_RE);
    if (qtyMatch) {
      quantity = Math.max(1, parseInt(qtyMatch[1], 10));
      name = name.replace(QTY_PREFIX_RE, '').trim();
    }
    // Strip trailing SKU-ish noise
    name = name.replace(/\s{2,}.*$/, '').replace(/[*#]+$/, '').trim();
    if (name.length < 2 || /^\d+$/.test(name)) {
      continue;
    }

    items.push({ name, quantity, priceCents });
  }

  return { storeCode, receiptDate, totalCents, items };
}

function normalizeDate(match: RegExpMatchArray): string | null {
  try {
    if (match[4]) {
      // yyyy-mm-dd
      const iso = `${match[4]}-${match[5]}-${match[6]}`;
      return Number.isNaN(Date.parse(iso)) ? null : iso;
    }
    let year = parseInt(match[3], 10);
    if (year < 100) {
      year += 2000;
    }
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > 2100) {
      return null;
    }
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return Number.isNaN(Date.parse(iso)) ? null : iso;
  } catch {
    return null;
  }
}
