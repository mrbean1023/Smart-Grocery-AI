import type { StoreCode } from "@smart-grocery/shared";
import { STORE_INFO } from "@smart-grocery/shared";

export const STORE_CODES = Object.keys(STORE_INFO) as StoreCode[];

/** Tailwind classes for the coloured store chip of each chain. */
export const STORE_CHIP_CLASSES: Record<StoreCode, string> = {
  FAIRPRICE: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
  SHENG_SIONG: "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300",
  GIANT: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
  COLD_STORAGE: "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300",
  PRIME: "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300",
  REDMART: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
  AMAZON_FRESH: "bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-300",
};

export function storeName(code: StoreCode): string {
  return STORE_INFO[code]?.name ?? code;
}
