"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, PiggyBank, Store, Trash2, TrendingUp, Wallet } from "lucide-react";
import type { AnalyticsSummary } from "@smart-grocery/shared";

import { StatCard } from "@/components/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { formatSGD } from "@/lib/format";

const PIE_COLORS = ["#10b981", "#0ea5e9", "#f59e0b", "#8b5cf6", "#ef4444", "#14b8a6", "#f97316"];

function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return new Date(Number(y), Number(m) - 1).toLocaleDateString("en-SG", { month: "short" });
}

export default function AnalyticsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics"],
    queryFn: () => api<AnalyticsSummary>("/analytics/summary"),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  const spendTrend = data.spendTrend.map((p) => ({
    month: monthLabel(p.month),
    spent: p.totalCents / 100,
    saved: p.savedCents / 100,
  }));
  const inflation = data.inflationTrend.map((p) => ({
    month: monthLabel(p.month),
    index: Math.round(p.indexValue * 10) / 10,
  }));
  const byStore = data.spendByStore.map((s) => ({ name: s.storeName, value: s.totalCents / 100 }));

  const hasAnyData =
    data.monthlySpendCents > 0 || data.spendTrend.some((p) => p.totalCents > 0) || byStore.length > 0;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Wallet}
          label="Spent this month"
          value={formatSGD(data.monthlySpendCents)}
          hint="Purchased baskets + receipts"
        />
        <StatCard
          icon={PiggyBank}
          label="Saved this month"
          value={formatSGD(data.monthlySavingsCents)}
          hint="vs average single-store prices"
          tone="positive"
        />
        <StatCard
          icon={Trash2}
          label="Pantry waste rate"
          value={`${Math.round(data.pantryWaste.wasteRate * 100)}%`}
          hint={`${data.pantryWaste.wastedItems} items · ${formatSGD(data.pantryWaste.wastedValueCents)}`}
          tone={data.pantryWaste.wasteRate > 0.2 ? "warning" : undefined}
        />
        <StatCard
          icon={Store}
          label="Stores used (90d)"
          value={String(data.spendByStore.length)}
          hint={data.spendByStore[0] ? `Most: ${data.spendByStore[0].storeName}` : "No purchases yet"}
        />
      </div>

      {!hasAnyData ? (
        <EmptyState
          icon={BarChart3}
          title="No analytics yet"
          description="Optimize a basket and mark it purchased, or upload receipts — your savings and trends will show up here."
        />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardContent className="p-5">
                <h3 className="mb-4 text-sm font-semibold">Spending & savings — last 6 months</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={spendTrend} margin={{ left: 0, right: 8, top: 4 }}>
                    <defs>
                      <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} tickFormatter={(v) => `$${v}`} width={44} />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        `S$${value.toFixed(2)}`,
                        name === "spent" ? "Spent" : "Saved",
                      ]}
                    />
                    <Area type="monotone" dataKey="spent" stroke="#10b981" strokeWidth={2} fill="url(#spendFill)" />
                    <Area type="monotone" dataKey="saved" stroke="#0ea5e9" strokeWidth={2} fill="transparent" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <h3 className="mb-4 text-sm font-semibold">Spend by store — last 90 days</h3>
                {byStore.length === 0 ? (
                  <p className="flex h-60 items-center justify-center text-sm text-muted-foreground">
                    No purchased baskets yet.
                  </p>
                ) : (
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="55%" height={240}>
                      <PieChart>
                        <Pie data={byStore} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                          {byStore.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => `S$${value.toFixed(2)}`} />
                      </PieChart>
                    </ResponsiveContainer>
                    <ul className="flex-1 space-y-2 text-sm">
                      {byStore.map((s, i) => (
                        <li key={s.name} className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                            />
                            <span className="truncate">{s.name}</span>
                          </span>
                          <span className="shrink-0 font-medium">S${s.value.toFixed(0)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Grocery inflation index — 12 months</h3>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5" aria-hidden /> 100 = prices a year ago
                </span>
              </div>
              {inflation.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Not enough price history yet — check back soon.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={inflation} margin={{ left: 0, right: 8, top: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      fontSize={12}
                      domain={["dataMin - 2", "dataMax + 2"]}
                      width={40}
                    />
                    <Tooltip formatter={(value: number) => [value.toFixed(1), "Index"]} />
                    <Line type="monotone" dataKey="index" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
