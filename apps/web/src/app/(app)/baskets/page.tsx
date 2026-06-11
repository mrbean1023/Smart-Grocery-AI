"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ShoppingBasket, Sparkles, Store } from "lucide-react";
import type { BasketDto, BasketStatus } from "@smart-grocery/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { api, unwrapItems } from "@/lib/api";
import { formatDate, formatSGD } from "@/lib/format";
import { STRATEGY_META } from "@/lib/strategy-meta";

const STATUS_VARIANT: Record<BasketStatus, "secondary" | "success" | "info" | "outline"> = {
  DRAFT: "outline",
  OPTIMIZED: "info",
  PURCHASED: "success",
  ARCHIVED: "secondary",
};

export default function BasketsPage() {
  const { data: baskets, isLoading } = useQuery({
    queryKey: ["baskets"],
    queryFn: async () =>
      unwrapItems(await api<BasketDto[] | { items: BasketDto[] }>("/baskets")),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Your optimized shopping baskets — open one for the store-by-store checklist.
        </p>
        <Button asChild>
          <Link href="/optimize">
            <Sparkles aria-hidden /> New basket
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : (baskets?.length ?? 0) === 0 ? (
        <EmptyState
          icon={ShoppingBasket}
          title="No baskets yet"
          description="Optimize a recipe or ingredient list and we'll build the cheapest basket across 7 stores."
          action={
            <Button asChild>
              <Link href="/optimize">
                <Sparkles aria-hidden /> Optimize your first basket
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {baskets!.map((b) => {
            const meta = STRATEGY_META[b.strategy];
            const checked = b.items.filter((i) => i.checked).length;
            return (
              <Link
                key={b.id}
                href={`/baskets/${b.id}`}
                className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Card className="h-full transition-shadow hover:shadow-md">
                  <CardContent className="space-y-3 p-5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="min-w-0 truncate font-semibold">{b.name}</h3>
                      <Badge variant={STATUS_VARIANT[b.status]} className="shrink-0 capitalize">
                        {b.status.toLowerCase()}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant="secondary">
                        {meta.emoji} {meta.label}
                      </Badge>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <Store className="h-3.5 w-3.5" aria-hidden />
                        {b.storeCount} {b.storeCount === 1 ? "store" : "stores"}
                      </span>
                    </div>
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-xl font-bold">{formatSGD(b.totalCents)}</p>
                        {b.savingsCents > 0 && (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400">
                            saved {formatSGD(b.savingsCents)}
                          </p>
                        )}
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <p>{formatDate(b.createdAt)}</p>
                        <p>
                          {checked}/{b.items.length} checked
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
