"use client";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export interface UsageRow {
  kind: string;
  used: number;
  limit: number;
  period: string;
}

const KIND_LABELS: Record<string, string> = {
  recipe_scans: "Recipe scans",
  recipeScans: "Recipe scans",
  recipe_scans_per_month: "Recipe scans",
  basket_optimizations: "Basket optimizations",
  basketOptimizations: "Basket optimizations",
  ai_chat_messages: "AI chat messages",
  aiChatMessages: "AI chat messages",
  pantry_items: "Pantry items",
  pantryItems: "Pantry items",
};

export function usageLabel(kind: string): string {
  if (KIND_LABELS[kind]) return KIND_LABELS[kind];
  return kind
    .replace(/[_-]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

export function UsageMeter({ usage, className }: { usage: UsageRow; className?: string }) {
  const unlimited = usage.limit <= 0;
  const pct = unlimited ? 0 : Math.min(100, Math.round((usage.used / usage.limit) * 100));
  const nearLimit = !unlimited && pct >= 80;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{usageLabel(usage.kind)}</span>
        <span className="text-xs text-muted-foreground">
          {unlimited ? `${usage.used} used · Unlimited` : `${usage.used} / ${usage.limit} ${usage.period}`}
        </span>
      </div>
      {!unlimited && (
        <Progress
          value={pct}
          aria-label={`${usageLabel(usage.kind)} usage`}
          indicatorClassName={cn(nearLimit && "bg-amber-500", pct >= 100 && "bg-destructive")}
        />
      )}
    </div>
  );
}
