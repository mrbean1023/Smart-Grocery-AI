import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CalendarDays,
  Camera,
  Check,
  PiggyBank,
  Refrigerator,
  ScanLine,
  ShoppingBasket,
  Sparkles,
  Store,
  TrendingDown,
  Wallet,
} from "lucide-react";
import { PREMIUM_PRICE, STORE_INFO } from "@smart-grocery/shared";

import { MarketingShell } from "@/components/marketing/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatSGD } from "@/lib/format";

const STATS = [
  { icon: PiggyBank, value: "S$127", label: "average saved per month" },
  { icon: TrendingDown, value: "23%", label: "cheaper baskets on average" },
  { icon: Store, value: "7", label: "supermarkets compared live" },
];

const STEPS = [
  {
    icon: Camera,
    title: "Scan any recipe",
    body: "Snap a photo, paste a link or text — our AI extracts every ingredient and quantity in seconds.",
  },
  {
    icon: Sparkles,
    title: "We compare 7 stores",
    body: "FairPrice to RedMart: live prices, pack sizes and delivery fees crunched into four smart basket strategies.",
  },
  {
    icon: ShoppingBasket,
    title: "Shop the cheapest basket",
    body: "Follow a store-by-store checklist or order delivery — and watch your monthly savings stack up.",
  },
];

const FEATURES = [
  {
    icon: ScanLine,
    title: "Recipe scanning",
    body: "Photos, PDFs, URLs or plain text — turn any recipe into a structured shopping list with nutrition per serving.",
  },
  {
    icon: Store,
    title: "7-store price comparison",
    body: "One ingredient, every offer. Per-kg prices, promos and pack sizes across Singapore's major chains.",
  },
  {
    icon: ShoppingBasket,
    title: "4 basket strategies",
    body: "Cheapest overall, fewest stores, best delivery value or best quality — pick what matters this week.",
  },
  {
    icon: Refrigerator,
    title: "Smart pantry",
    body: "Track what you own, get expiry alerts before food is wasted, and skip buying what's already at home.",
  },
  {
    icon: CalendarDays,
    title: "AI meal plans",
    body: "A full week of meals generated inside your budget, calorie and protein targets — using your pantry first.",
  },
  {
    icon: Bot,
    title: "Grocery assistant",
    body: "Ask anything: “Cheapest high-protein dinner this week?” and get answers grounded in live SG prices.",
  },
];

const storeNames = Object.values(STORE_INFO).map((s) => s.name);

export default function HomePage() {
  return (
    <MarketingShell>
      {/* Hero */}
      <section className="bg-hero-gradient">
        <div className="mx-auto max-w-6xl px-4 pb-20 pt-16 sm:px-6 sm:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="secondary" className="mb-5 px-3 py-1">
              <Sparkles className="mr-1" aria-hidden /> Built for Singapore shoppers
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
              Stop overpaying for{" "}
              <span className="bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
                groceries
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
              Scan a recipe, and our AI compares live prices across 7 Singapore supermarkets to
              build your cheapest possible basket — delivery fees included.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link href="/register">
                  Start saving — it&apos;s free <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/pricing">See pricing</Link>
              </Button>
            </div>
          </div>

          {/* Stat cards */}
          <div className="mx-auto mt-14 grid max-w-3xl gap-4 sm:grid-cols-3">
            {STATS.map((s) => (
              <Card key={s.label} className="glass">
                <CardContent className="flex flex-col items-center gap-1 p-5 text-center">
                  <s.icon className="mb-1 h-5 w-5 text-primary" aria-hidden />
                  <span className="text-3xl font-bold tracking-tight">{s.value}</span>
                  <span className="text-sm text-muted-foreground">{s.label}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Store logos row */}
      <section className="border-y bg-muted/40 py-8">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="mb-4 text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Comparing live prices across
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {storeNames.map((name) => (
              <span
                key={name}
                className="rounded-full border bg-background px-4 py-1.5 text-sm font-semibold text-foreground/80 shadow-sm"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mx-auto mb-12 max-w-xl text-center">
          <h2 className="text-3xl font-bold tracking-tight">How it works</h2>
          <p className="mt-3 text-muted-foreground">
            From recipe to the cheapest checkout in under a minute.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <Card key={step.title} className="relative overflow-hidden">
              <CardContent className="p-6">
                <span className="absolute right-4 top-3 text-5xl font-black text-primary/10">
                  {i + 1}
                </span>
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                  <step.icon className="h-5 w-5 text-primary" aria-hidden />
                </div>
                <h3 className="mb-2 font-semibold">{step.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Feature grid */}
      <section className="border-t bg-muted/30 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto mb-12 max-w-xl text-center">
            <h2 className="text-3xl font-bold tracking-tight">
              Everything between recipe and receipt
            </h2>
            <p className="mt-3 text-muted-foreground">
              One app for planning, comparing, shopping and tracking.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <Card key={f.title}>
                <CardContent className="p-6">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <f.icon className="h-5 w-5 text-primary" aria-hidden />
                  </div>
                  <h3 className="mb-1.5 font-semibold">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{f.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <Card className="overflow-hidden bg-hero-gradient">
          <CardContent className="flex flex-col items-center gap-6 p-10 text-center sm:p-14">
            <Wallet className="h-8 w-8 text-primary" aria-hidden />
            <div className="space-y-2">
              <h2 className="text-3xl font-bold tracking-tight">
                Free to start. {formatSGD(PREMIUM_PRICE.monthlyCentsSGD)}/month for everything.
              </h2>
              <p className="mx-auto max-w-lg text-muted-foreground">
                Free covers 5 recipe scans a month and a daily basket optimization. Premium
                unlocks meal planning, price forecasts and unlimited everything — or{" "}
                {formatSGD(PREMIUM_PRICE.yearlyCentsSGD)}/year with 2 months free.
              </p>
            </div>
            <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
              {["No credit card needed", "Cancel anytime", "Prices in SGD"].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-primary" aria-hidden /> {t}
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link href="/register">
                  Create free account <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/pricing">Compare plans</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </MarketingShell>
  );
}
