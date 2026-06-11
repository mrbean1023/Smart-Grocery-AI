import { format, formatDistanceToNowStrict, isToday, isYesterday } from "date-fns";
import { formatQuantity, type CanonicalUnit } from "@smart-grocery/shared";

export { formatSGD } from "@smart-grocery/shared";

/** "12 Jun 2026" */
export function formatDate(value: string | Date): string {
  return format(new Date(value), "d MMM yyyy");
}

/** "12 Jun 2026, 4:05 pm" */
export function formatDateTime(value: string | Date): string {
  return format(new Date(value), "d MMM yyyy, h:mm a");
}

/** Friendly relative timestamp for feeds/chat. */
export function formatRelative(value: string | Date): string {
  const date = new Date(value);
  if (isToday(date)) return format(date, "h:mm a");
  if (isYesterday(date)) return `Yesterday, ${format(date, "h:mm a")}`;
  return format(date, "d MMM yyyy");
}

/** Grams → "250 g" / "1.5 kg" (delegates to shared engine). */
export function formatGrams(grams: number): string {
  return formatQuantity(grams, "g");
}

export function formatCanonical(value: number, unit: CanonicalUnit): string {
  return formatQuantity(value, unit);
}

/** "S$3.20/kg" style unit-price label. */
export function formatPerKg(cents: number | null | undefined): string | null {
  if (cents === null || cents === undefined) return null;
  return `S$${(cents / 100).toFixed(2)}/kg`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}
