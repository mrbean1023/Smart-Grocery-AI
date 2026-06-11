"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import {
  ArrowDownRight,
  ArrowRightCircle,
  ArrowUpRight,
  Bell,
  Crown,
  Flag,
  Loader2,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format } from "date-fns";
import type {
  PriceForecastDto,
  ProductDto,
  StoreCode,
} from "@smart-grocery/shared";

import { StoreBadge } from "@/components/store-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { handleApiError, isUpgradeError } from "@/lib/errors";
import { formatPerKg, formatSGD } from "@/lib/format";
import { STORE_CODES, storeName } from "@/lib/store-meta";
import { useUpgradePrompt } from "@/stores/upgrade-store";

interface HistoryPoint {
  date: string;
  priceCents: number;
}

function ForecastSection({ productId }: { productId: string }) {
  const { data: session } = useSession();
  const showUpgrade = useUpgradePrompt((s) => s.show);
  const isPremium = session?.user?.tier === "PREMIUM";

  const forecast = useQuery({
    queryKey: ["product", productId, "forecast"],
    queryFn: () => api<PriceForecastDto[]>(`/products/${productId}/forecast`),
    enabled: isPremium,
    retry: false,
  });

  const gated = !isPremium || isUpgradeError(forecast.error);

  if (gated) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Price forecast</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative overflow-hidden rounded-lg">
            <div className="pointer-events-none grid select-none gap-3 blur-sm sm:grid-cols-3" aria-hidden>
              {[
                { horizon: "7 days", dir: "DOWN", price: 489 },
                { horizon: "14 days", dir: "STABLE", price: 512 },
                { horizon: "30 days", dir: "UP", price: 545 },
              ].map((f) => (
                <div key={f.horizon} className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">{f.horizon}</p>
                  <p className="text-lg font-bold">{formatSGD(f.price)}</p>
                  <p className="text-xs">{f.dir}</p>
                </div>
              ))}
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/60 text-center">
              <Lock className="h-5 w-5 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium">Know when prices will rise or fall</p>
              <Button size="sm" onClick={() => showUpgrade("Price forecasting is a Premium feature.")}>
                <Crown aria-hidden /> Unlock with Premium
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Price forecast</CardTitle>
      </CardHeader>
      <CardContent>
        {forecast.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-lg" />
            ))}
          </div>
        ) : (forecast.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">
            Not enough price history to forecast this product yet.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {forecast.data!.map((f) => (
              <div key={f.horizonDays} className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">In {f.horizonDays} days</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-lg font-bold">{formatSGD(f.predictedPriceCents)}</span>
                  {f.direction === "UP" ? (
                    <ArrowUpRight className="h-4 w-4 text-red-500" aria-label="Trending up" />
                  ) : f.direction === "DOWN" ? (
                    <ArrowDownRight
                      className="h-4 w-4 text-emerald-500"
                      aria-label="Trending down"
                    />
                  ) : (
                    <ArrowRightCircle
                      className="h-4 w-4 text-muted-foreground"
                      aria-label="Stable"
                    />
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {(f.confidence * 100).toFixed(0)}% confidence
                  {f.promoLikelihood > 0.4
                    ? ` · ${(f.promoLikelihood * 100).toFixed(0)}% promo chance`
                    : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [watchOpen, setWatchOpen] = React.useState(false);
  const [targetPrice, setTargetPrice] = React.useState("");
  const [reportOpen, setReportOpen] = React.useState(false);
  const [reportStore, setReportStore] = React.useState<StoreCode | "">("");
  const [reportPrice, setReportPrice] = React.useState("");
  const [reportPackSize, setReportPackSize] = React.useState("");
  const [reportPackUnit, setReportPackUnit] = React.useState("");

  const { data: product, isLoading } = useQuery({
    queryKey: ["product", id],
    queryFn: () => api<ProductDto>(`/products/${id}`),
  });

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ["product", id, "history"],
    queryFn: () => api<HistoryPoint[]>(`/products/${id}/history`, { query: { days: 90 } }),
  });

  const watch = useMutation({
    mutationFn: () =>
      api("/price-watches", {
        method: "POST",
        body: {
          productId: id,
          targetPriceCents: targetPrice
            ? Math.round(parseFloat(targetPrice) * 100)
            : undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Price watch created — we'll alert you on drops.");
      setWatchOpen(false);
      setTargetPrice("");
    },
    onError: (e) => handleApiError(e, "Could not create price watch"),
  });

  const report = useMutation({
    mutationFn: () =>
      api("/prices/submissions", {
        method: "POST",
        body: {
          storeCode: reportStore,
          productName: product?.name ?? "",
          priceCents: Math.round(parseFloat(reportPrice) * 100),
          packSize: reportPackSize ? parseFloat(reportPackSize) : undefined,
          packUnit: reportPackUnit || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Thanks! Your price report helps every shopper.");
      setReportOpen(false);
      setReportPrice("");
    },
    onError: (e) => handleApiError(e, "Could not submit price"),
  });

  if (isLoading || !product) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  const price = product.currentPrice;
  const chartData = (history ?? []).map((p) => ({
    ...p,
    label: format(new Date(p.date), "d MMM"),
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">{product.name}</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {product.store && <StoreBadge code={product.store.code} />}
            {product.brand && <Badge variant="secondary">{product.brand}</Badge>}
            <Badge variant="outline">
              {product.unitCount > 1 ? `${product.unitCount} × ` : ""}
              {product.packSize}
              {product.packUnit.toLowerCase()}
            </Badge>
            {product.isOrganic && <Badge variant="success">Organic</Badge>}
            {product.isHalal && <Badge variant="info">Halal</Badge>}
            {!product.isAvailable && <Badge variant="destructive">Out of stock</Badge>}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button onClick={() => setWatchOpen(true)}>
            <Bell aria-hidden /> Watch price
          </Button>
          <Button variant="outline" onClick={() => setReportOpen(true)}>
            <Flag aria-hidden /> Report price
          </Button>
        </div>
      </div>

      {/* Current offer */}
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-sm text-muted-foreground">Current price</p>
            {price ? (
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold">{formatSGD(price.priceCents)}</span>
                {price.isPromo && price.wasPriceCents && (
                  <span className="text-sm text-muted-foreground line-through">
                    {formatSGD(price.wasPriceCents)}
                  </span>
                )}
                {price.isPromo && <Badge variant="success">Promo</Badge>}
              </div>
            ) : (
              <p className="text-lg font-semibold text-muted-foreground">No price data</p>
            )}
          </div>
          <dl className="flex gap-6 text-sm">
            {price?.pricePerKgCents != null && (
              <div>
                <dt className="text-muted-foreground">Per kg</dt>
                <dd className="font-semibold">{formatPerKg(price.pricePerKgCents)}</dd>
              </div>
            )}
            {price?.pricePerLCents != null && (
              <div>
                <dt className="text-muted-foreground">Per litre</dt>
                <dd className="font-semibold">S${(price.pricePerLCents / 100).toFixed(2)}/L</dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">Quality tier</dt>
              <dd className="font-semibold">{product.qualityTier} / 5</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Price history */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Price history — last 90 days</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          {historyLoading ? (
            <Skeleton className="h-full w-full" />
          ) : chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No price history recorded yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={28}
                />
                <YAxis
                  tickFormatter={(v: number) => `$${(v / 100).toFixed(1)}`}
                  tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  domain={["dataMin - 20", "dataMax + 20"]}
                />
                <RechartsTooltip
                  formatter={(value: number) => [formatSGD(value), "Price"]}
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    color: "var(--popover-foreground)",
                    fontSize: 12,
                  }}
                />
                <Line
                  type="stepAfter"
                  dataKey="priceCents"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Forecast */}
      <ForecastSection productId={id} />

      {/* Watch price dialog */}
      <Dialog open={watchOpen} onOpenChange={setWatchOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Watch this price</DialogTitle>
            <DialogDescription>
              We&apos;ll notify you when the price drops — optionally only below a target.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="target-price">Target price (S$, optional)</Label>
            <Input
              id="target-price"
              type="number"
              step="0.01"
              min="0"
              placeholder={price ? (price.priceCents / 100).toFixed(2) : "e.g. 4.50"}
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWatchOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => watch.mutate()} disabled={watch.isPending}>
              {watch.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Start watching
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Report price dialog */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Report a price</DialogTitle>
            <DialogDescription>
              Spotted a different price in store? Crowdsourced reports keep comparisons accurate.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label>Store</Label>
              <Select
                value={reportStore}
                onValueChange={(v) => setReportStore(v as StoreCode)}
              >
                <SelectTrigger aria-label="Store">
                  <SelectValue placeholder="Choose a store" />
                </SelectTrigger>
                <SelectContent>
                  {STORE_CODES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {storeName(code)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-price">Price (S$)</Label>
              <Input
                id="report-price"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="e.g. 5.20"
                value={reportPrice}
                onChange={(e) => setReportPrice(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="report-pack-size">Pack size (optional)</Label>
                <Input
                  id="report-pack-size"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="e.g. 500"
                  value={reportPackSize}
                  onChange={(e) => setReportPackSize(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="report-pack-unit">Unit (optional)</Label>
                <Input
                  id="report-pack-unit"
                  placeholder="e.g. g, ml, pack"
                  value={reportPackUnit}
                  onChange={(e) => setReportPackUnit(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => report.mutate()}
              disabled={!reportStore || !reportPrice || report.isPending}
            >
              {report.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Submit report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
