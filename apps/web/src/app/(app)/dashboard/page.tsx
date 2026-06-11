"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  ChefHat,
  Crown,
  PiggyBank,
  ShoppingBasket,
  Sparkles,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  AnalyticsSummary,
  BasketDto,
  PantryItemDto,
  RecipeDto,
} from "@smart-grocery/shared";

import { RecipeCard } from "@/components/recipe-card";
import { StatCard } from "@/components/stat-card";
import { UsageMeter, type UsageRow } from "@/components/usage-meter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatDate, formatSGD } from "@/lib/format";
import { STRATEGY_META } from "@/lib/strategy-meta";
import { useUpgradePrompt } from "@/stores/upgrade-store";

interface Recommendation {
  recipe: Pick<
    RecipeDto,
    "id" | "title" | "imageUrl" | "tags" | "nutrition" | "status" | "prepMinutes" | "cookMinutes"
  >;
  score: number;
  pantryCoverage: number;
  estimatedCostCents: number;
  missingIngredients: string[];
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const showUpgrade = useUpgradePrompt((s) => s.show);
  const firstName = session?.user?.name?.split(" ")[0] ?? "there";
  const isFree = session?.user?.tier !== "PREMIUM";

  const summary = useQuery({
    queryKey: ["analytics", "summary"],
    queryFn: () => api<AnalyticsSummary>("/analytics/summary"),
  });

  const expiring = useQuery({
    queryKey: ["pantry", "expiring", 5],
    queryFn: () => api<PantryItemDto[]>("/pantry/expiring", { query: { days: 5 } }),
  });

  const usage = useQuery({
    queryKey: ["billing", "usage"],
    queryFn: () => api<UsageRow[]>("/billing/usage"),
  });

  const recommendations = useQuery({
    queryKey: ["recommendations", "recipes"],
    queryFn: () =>
      api<Recommendation[]>("/recommendations/recipes", {
        query: {
          limit: 4,
          budgetCents: session?.user?.weeklyBudgetCents ?? undefined,
        },
      }),
  });

  const baskets = useQuery({
    queryKey: ["baskets"],
    queryFn: () => api<BasketDto[]>("/baskets"),
  });

  const scanUsage = usage.data?.find((u) => /recipe|scan/i.test(u.kind));
  const trend = summary.data?.spendTrend ?? [];
  const recentBaskets = (baskets.data ?? []).slice(0, 4);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">
          {greeting()}, {firstName}
        </h2>
        <p className="text-sm text-muted-foreground">
          Here&apos;s how your grocery spending is looking.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="This month spend"
          icon={Wallet}
          loading={summary.isLoading}
          value={summary.data ? formatSGD(summary.data.monthlySpendCents) : "—"}
        />
        <StatCard
          label="Saved this month"
          icon={PiggyBank}
          tone="positive"
          loading={summary.isLoading}
          value={summary.data ? formatSGD(summary.data.monthlySavingsCents) : "—"}
        />
        <StatCard
          label="Expiring soon"
          icon={CalendarClock}
          tone={(expiring.data?.length ?? 0) > 0 ? "warning" : "default"}
          loading={expiring.isLoading}
          value={expiring.data?.length ?? 0}
          hint="pantry items in the next 5 days"
        />
        <StatCard
          label="Recipe scans"
          icon={ChefHat}
          loading={usage.isLoading}
          value={
            scanUsage
              ? scanUsage.limit > 0
                ? `${scanUsage.used} / ${scanUsage.limit}`
                : `${scanUsage.used}`
              : "—"
          }
          hint={scanUsage?.period}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Spend trend */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Spend trend</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {summary.isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : trend.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Save a basket as purchased to start tracking spend.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tickFormatter={(v: number) => `$${Math.round(v / 100)}`}
                    tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                    tickLine={false}
                    axisLine={false}
                    width={42}
                  />
                  <RechartsTooltip
                    formatter={(value: number, name: string) => [
                      formatSGD(value),
                      name === "totalCents" ? "Spend" : "Saved",
                    ]}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      color: "var(--popover-foreground)",
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="totalCents"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    fill="url(#spendFill)"
                  />
                  <Area
                    type="monotone"
                    dataKey="savedCents"
                    stroke="var(--chart-2)"
                    strokeWidth={2}
                    fill="transparent"
                    strokeDasharray="4 4"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Usage / upgrade card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              Plan usage
              {isFree && <Badge variant="secondary">Free plan</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {usage.isLoading ? (
              <>
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </>
            ) : (usage.data?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No usage recorded yet.</p>
            ) : (
              usage.data!.map((u) => <UsageMeter key={u.kind} usage={u} />)
            )}
            {isFree && (
              <Button className="w-full" onClick={() => showUpgrade()}>
                <Crown aria-hidden /> Upgrade to Premium
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recommended recipes */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold tracking-tight">Recommended for you</h3>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/recipes">
              All recipes <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
        {recommendations.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[4/3] w-full rounded-xl" />
            ))}
          </div>
        ) : (recommendations.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No recommendations yet"
            description="Add a few recipes and pantry items so we can suggest budget-friendly meals you can cook."
            action={
              <Button asChild>
                <Link href="/recipes/new">Add your first recipe</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {recommendations.data!.map((rec) => (
              <RecipeCard
                key={rec.recipe.id}
                recipe={rec.recipe}
                footer={
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-primary">
                      ~{formatSGD(rec.estimatedCostCents)}
                    </span>
                    <span className="text-muted-foreground">
                      {Math.round(rec.pantryCoverage * 100)}% in pantry
                    </span>
                  </div>
                }
              />
            ))}
          </div>
        )}
      </section>

      {/* Recent baskets */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold tracking-tight">Recent baskets</h3>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/baskets">
              All baskets <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
        {baskets.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : recentBaskets.length === 0 ? (
          <EmptyState
            icon={ShoppingBasket}
            title="No baskets yet"
            description="Optimize a recipe to build your first money-saving shopping basket."
            action={
              <Button asChild>
                <Link href="/optimize">
                  <Sparkles aria-hidden /> Optimize a basket
                </Link>
              </Button>
            }
          />
        ) : (
          <Card>
            <ul className="divide-y">
              {recentBaskets.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/baskets/${b.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{b.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(b.createdAt)} · {b.storeCount}{" "}
                        {b.storeCount === 1 ? "store" : "stores"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="secondary">
                        {STRATEGY_META[b.strategy].emoji} {STRATEGY_META[b.strategy].label}
                      </Badge>
                      <span className="text-sm font-semibold">{formatSGD(b.totalCents)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
