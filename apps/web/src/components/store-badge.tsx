import type { StoreCode } from "@smart-grocery/shared";

import { STORE_CHIP_CLASSES, storeName } from "@/lib/store-meta";
import { cn } from "@/lib/utils";

export function StoreBadge({
  code,
  className,
}: {
  code: StoreCode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        STORE_CHIP_CLASSES[code] ?? "bg-secondary text-secondary-foreground",
        className,
      )}
    >
      {storeName(code)}
    </span>
  );
}
