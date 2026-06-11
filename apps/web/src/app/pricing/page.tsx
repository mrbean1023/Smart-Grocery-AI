import type { Metadata } from "next";
import Link from "next/link";
import { Check, Crown, Minus } from "lucide-react";
import { FREE_TIER_LIMITS, PREMIUM_PRICE } from "@smart-grocery/shared";

import { MarketingShell } from "@/components/marketing/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatSGD } from "@/lib/format";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Free forever for casual shoppers. Premium at S$7.90/month for meal planning, price forecasts and unlimited everything.",
};

interface FeatureRow {
  label: string;
  free: string | boolean;
  premium: string | boolean;
}

const ROWS: FeatureRow[] = [
  {
    label: "Recipe scans (photo, PDF, URL, paste)",
    free: `${FREE_TIER_LIMITS.recipeScansPerMonth} / month`,
    premium: "Unlimited",
  },
  {
    label: "Basket optimizations",
    free: `${FREE_TIER_LIMITS.basketOptimizationsPerDay} / day`,
    premium: "Unlimited",
  },
  {
    label: "AI assistant messages",
    free: `${FREE_TIER_LIMITS.aiChatMessagesPerDay} / day`,
    premium: "Unlimited",
  },
  {
    label: "Pantry items",
    free: `Up to ${FREE_TIER_LIMITS.pantryItemsMax}`,
    premium: "Unlimited",
  },
  { label: "Price comparison across 7 stores", free: true, premium: true },
  { label: "Price history charts", free: true, premium: true },
  { label: "AI weekly meal planning", free: FREE_TIER_LIMITS.mealPlanning, premium: true },
  { label: "Price forecasting (buy-now signals)", free: FREE_TIER_LIMITS.priceForecasting, premium: true },
  { label: "Price drop, promo & budget alerts", free: FREE_TIER_LIMITS.alerts, premium: true },
];

function Cell({ value }: { value: string | boolean }) {
  if (value === true) return <Check className="mx-auto h-4 w-4 text-primary" aria-label="Included" />;
  if (value === false)
    return <Minus className="mx-auto h-4 w-4 text-muted-foreground/50" aria-label="Not included" />;
  return <span className="text-sm font-medium">{value}</span>;
}

export default function PricingPage() {
  return (
    <MarketingShell>
      <section className="bg-hero-gradient">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Pays for itself in one shop
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            The average Premium member saves over {formatSGD(10000)} a month — Premium costs{" "}
            {formatSGD(PREMIUM_PRICE.monthlyCentsSGD)}.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 pb-20 sm:px-6">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Free plan */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Free</CardTitle>
              <p className="text-sm text-muted-foreground">For the occasional cook</p>
              <p className="pt-2">
                <span className="text-4xl font-bold">S$0</span>
                <span className="text-muted-foreground"> / forever</span>
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button variant="outline" className="w-full" asChild>
                <Link href="/register">Create free account</Link>
              </Button>
              <ul className="space-y-2 text-sm">
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  {FREE_TIER_LIMITS.recipeScansPerMonth} recipe scans per month
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  {FREE_TIER_LIMITS.basketOptimizationsPerDay} basket optimization per day
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  {FREE_TIER_LIMITS.aiChatMessagesPerDay} AI chat messages per day
                </li>
                <li className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  Pantry tracking up to {FREE_TIER_LIMITS.pantryItemsMax} items
                </li>
              </ul>
            </CardContent>
          </Card>

          {/* Premium plan */}
          <Card className="relative border-primary shadow-lg shadow-primary/10">
            <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Crown aria-hidden /> Most popular
            </Badge>
            <CardHeader>
              <CardTitle className="text-xl">Premium</CardTitle>
              <p className="text-sm text-muted-foreground">For households serious about saving</p>
              <p className="pt-2">
                <span className="text-4xl font-bold">
                  {formatSGD(PREMIUM_PRICE.monthlyCentsSGD)}
                </span>
                <span className="text-muted-foreground"> / month</span>
              </p>
              <p className="text-sm text-muted-foreground">
                or {formatSGD(PREMIUM_PRICE.yearlyCentsSGD)} / year — 2 months free
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button className="w-full" asChild>
                <Link href="/register?plan=premium">Start with Premium</Link>
              </Button>
              <ul className="space-y-2 text-sm">
                {[
                  "Unlimited scans, optimizations and chats",
                  "AI weekly meal planning within budget",
                  "Price forecasts: buy before prices rise",
                  "Price drop, promo and budget alerts",
                  "Unlimited pantry items",
                ].map((t) => (
                  <li key={t} className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Comparison table */}
        <Card className="mt-10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-4 py-3 text-sm font-semibold">Feature</th>
                  <th className="w-32 px-4 py-3 text-center text-sm font-semibold">Free</th>
                  <th className="w-32 px-4 py-3 text-center text-sm font-semibold text-primary">
                    Premium
                  </th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.label} className="border-b last:border-0">
                    <td className="px-4 py-3 text-sm">{row.label}</td>
                    <td className="px-4 py-3 text-center">
                      <Cell value={row.free} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Cell value={row.premium} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          All prices in Singapore dollars. Cancel anytime — your plan stays active until the end
          of the billing period.
        </p>
      </section>
    </MarketingShell>
  );
}
