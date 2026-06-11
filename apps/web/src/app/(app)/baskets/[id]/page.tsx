"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, PartyPopper, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { BasketDto, BasketItemDto, StoreCode } from "@smart-grocery/shared";

import { StoreBadge } from "@/components/store-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { handleApiError } from "@/lib/errors";
import { formatDate, formatGrams, formatSGD } from "@/lib/format";
import { STRATEGY_META } from "@/lib/strategy-meta";
import { cn } from "@/lib/utils";

interface StoreGroup {
  storeCode: StoreCode | null;
  items: BasketItemDto[];
  subtotalCents: number;
}

export default function BasketDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = params.id;
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const { data: basket, isLoading } = useQuery({
    queryKey: ["basket", id],
    queryFn: () => api<BasketDto>(`/baskets/${id}`),
  });

  const toggleItem = useMutation({
    mutationFn: ({ itemId, checked }: { itemId: string; checked: boolean }) =>
      api(`/baskets/${id}/items/${itemId}`, { method: "PATCH", body: { checked } }),
    // Optimistic update
    onMutate: async ({ itemId, checked }) => {
      await queryClient.cancelQueries({ queryKey: ["basket", id] });
      const previous = queryClient.getQueryData<BasketDto>(["basket", id]);
      queryClient.setQueryData<BasketDto>(["basket", id], (old) =>
        old
          ? {
              ...old,
              items: old.items.map((it) => (it.id === itemId ? { ...it, checked } : it)),
            }
          : old,
      );
      return { previous };
    },
    onError: (e, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["basket", id], ctx.previous);
      handleApiError(e, "Could not update item");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["basket", id] });
    },
  });

  const markPurchased = useMutation({
    mutationFn: () => api(`/baskets/${id}`, { method: "PATCH", body: { status: "PURCHASED" } }),
    onSuccess: () => {
      toast.success("Basket marked as purchased — nice savings!", {
        icon: <PartyPopper className="h-4 w-4" />,
      });
      void queryClient.invalidateQueries({ queryKey: ["basket", id] });
      void queryClient.invalidateQueries({ queryKey: ["baskets"] });
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
    },
    onError: (e) => handleApiError(e, "Could not update basket"),
  });

  const remove = useMutation({
    mutationFn: () => api(`/baskets/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Basket deleted");
      void queryClient.invalidateQueries({ queryKey: ["baskets"] });
      router.push("/baskets");
    },
    onError: (e) => handleApiError(e, "Could not delete basket"),
  });

  const groups = React.useMemo<StoreGroup[]>(() => {
    if (!basket) return [];
    const map = new Map<string, StoreGroup>();
    for (const item of basket.items) {
      const code = item.product?.store?.code ?? null;
      const key = code ?? "UNMATCHED";
      if (!map.has(key)) map.set(key, { storeCode: code, items: [], subtotalCents: 0 });
      const group = map.get(key)!;
      group.items.push(item);
      group.subtotalCents += item.totalCents;
    }
    return [...map.values()].sort((a, b) => (a.storeCode === null ? 1 : b.storeCode === null ? -1 : 0));
  }, [basket]);

  if (isLoading || !basket) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  const meta = STRATEGY_META[basket.strategy];
  const totalChecked = basket.items.filter((i) => i.checked).length;
  const unmatchedItems = basket.items.filter((i) => i.unmatched);
  const purchased = basket.status === "PURCHASED";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <h2 className="text-2xl font-bold tracking-tight">{basket.name}</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">
              {meta.emoji} {meta.label}
            </Badge>
            <span>{formatDate(basket.createdAt)}</span>
            <span>·</span>
            <span>
              {basket.storeCount} {basket.storeCount === 1 ? "store" : "stores"}
            </span>
            {purchased && (
              <Badge variant="success">
                <CheckCircle2 aria-hidden /> Purchased
              </Badge>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {!purchased && (
            <Button onClick={() => markPurchased.mutate()} disabled={markPurchased.isPending}>
              {markPurchased.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 aria-hidden />
              )}
              Mark purchased
            </Button>
          )}
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
            aria-label="Delete basket"
          >
            <Trash2 aria-hidden /> Delete
          </Button>
        </div>
      </div>

      {/* Overall progress */}
      <Card>
        <CardContent className="space-y-2 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Shopping progress</span>
            <span className="text-muted-foreground">
              {totalChecked} of {basket.items.length} items
            </span>
          </div>
          <Progress
            value={basket.items.length ? (totalChecked / basket.items.length) * 100 : 0}
            aria-label="Overall shopping progress"
          />
        </CardContent>
      </Card>

      {unmatchedItems.length > 0 && (
        <Alert variant="warning">
          <AlertTriangle aria-hidden />
          <AlertTitle>
            {unmatchedItems.length} item{unmatchedItems.length === 1 ? "" : "s"} without a store
            match
          </AlertTitle>
          <AlertDescription>
            {unmatchedItems.map((i) => i.ingredientName).join(", ")} — grab these wherever
            convenient.
          </AlertDescription>
        </Alert>
      )}

      {/* Store groups */}
      <div className="space-y-4">
        {groups.map((group) => {
          const checked = group.items.filter((i) => i.checked).length;
          const pct = group.items.length ? (checked / group.items.length) * 100 : 0;
          return (
            <Card key={group.storeCode ?? "unmatched"} className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  {group.storeCode ? (
                    <StoreBadge code={group.storeCode} />
                  ) : (
                    <Badge variant="warning">Anywhere</Badge>
                  )}
                  <div className="hidden w-36 sm:block">
                    <Progress
                      value={pct}
                      aria-label={`${group.storeCode ?? "Unmatched"} progress`}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {checked}/{group.items.length}
                  </span>
                </div>
                <span className="shrink-0 text-sm font-semibold">
                  {formatSGD(group.subtotalCents)}
                </span>
              </div>
              <ul className="divide-y">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40",
                        item.checked && "opacity-60",
                      )}
                    >
                      <Checkbox
                        checked={item.checked}
                        onCheckedChange={(v) =>
                          toggleItem.mutate({ itemId: item.id, checked: v === true })
                        }
                        aria-label={`Mark ${item.product?.name ?? item.ingredientName} as picked`}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "truncate text-sm font-medium",
                            item.checked && "line-through",
                          )}
                        >
                          {item.product?.name ?? item.ingredientName}
                          {item.isSubstitute && (
                            <Badge variant="info" className="ml-2">
                              substitute
                            </Badge>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.product?.brand ? `${item.product.brand} · ` : ""}
                          {item.product
                            ? `${item.product.packSize}${item.product.packUnit.toLowerCase()}`
                            : item.ingredientName}
                          {item.requiredQtyG ? ` · needs ${formatGrams(item.requiredQtyG)}` : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold">{formatSGD(item.totalCents)}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.quantity} × {formatSGD(item.unitPriceCents)}
                        </p>
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>

      {/* Totals footer */}
      <Card>
        <CardContent className="space-y-2 p-5">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Items subtotal</span>
            <span className="font-medium">{formatSGD(basket.totalCents)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Delivery</span>
            <span className="font-medium">{formatSGD(basket.deliveryCents)}</span>
          </div>
          {basket.savingsCents > 0 && (
            <div className="flex justify-between text-sm text-emerald-600 dark:text-emerald-400">
              <span>Estimated savings</span>
              <span className="font-medium">−{formatSGD(basket.savingsCents)}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-2 text-base font-bold">
            <span>Total</span>
            <span>{formatSGD(basket.totalCents + basket.deliveryCents)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Delete confirm */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this basket?</DialogTitle>
            <DialogDescription>
              This removes the basket and its checklist permanently.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={remove.isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => remove.mutate()} disabled={remove.isPending}>
              {remove.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete basket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
