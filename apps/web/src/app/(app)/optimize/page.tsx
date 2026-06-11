"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronsUpDown,
  ListPlus,
  Loader2,
  Minus,
  Plus,
  Save,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import type {
  BasketDto,
  BasketStrategy,
  OptimizationResult,
  Paginated,
  RecipeDto,
  StoreCode,
} from "@smart-grocery/shared";

import { StoreBadge } from "@/components/store-badge";
import { TagInput } from "@/components/tag-input";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { api } from "@/lib/api";
import { handleApiError } from "@/lib/errors";
import { formatGrams, formatSGD } from "@/lib/format";
import { STORE_CODES, storeName } from "@/lib/store-meta";
import { STRATEGY_META } from "@/lib/strategy-meta";
import { useUiStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

interface IngredientSearchHit {
  id: string;
  name: string;
  displayName: string;
}

function RecipePicker({
  selected,
  onSelect,
}: {
  selected: RecipeDto | null;
  onSelect: (r: RecipeDto) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");

  React.useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading } = useQuery({
    queryKey: ["recipes", "picker", search],
    queryFn: () =>
      api<Paginated<RecipeDto>>("/recipes", {
        query: { page: 1, pageSize: 10, search: search || undefined },
      }),
    enabled: open,
  });

  const recipes = (data?.items ?? []).filter((r) => r.status === "READY");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.title : "Choose a recipe…"}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <div className="border-b p-2">
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search your recipes…"
            aria-label="Search recipes"
            className="h-8"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {isLoading ? (
            <div className="space-y-2 p-2">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-3/4" />
            </div>
          ) : recipes.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">No ready recipes found.</p>
          ) : (
            recipes.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  onSelect(r);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="truncate">{r.title}</span>
                {selected?.id === r.id && <Check className="h-4 w-4 shrink-0 text-primary" />}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function OptimizeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlRecipeId = searchParams.get("recipeId");
  const urlMultiplier = Number(searchParams.get("multiplier") ?? "");

  const draftIngredients = useUiStore((s) => s.draftIngredients);
  const setDraftIngredients = useUiStore((s) => s.setDraftIngredients);

  const [mode, setMode] = React.useState<"recipe" | "ingredients">(
    urlRecipeId ? "recipe" : "ingredients",
  );
  const [recipe, setRecipe] = React.useState<RecipeDto | null>(null);
  const [multiplier, setMultiplier] = React.useState(
    Number.isFinite(urlMultiplier) && urlMultiplier > 0 ? urlMultiplier : 1,
  );
  const [usePantry, setUsePantry] = React.useState(true);
  const [excludedStores, setExcludedStores] = React.useState<StoreCode[]>([]);
  const [results, setResults] = React.useState<OptimizationResult[] | null>(null);
  const [selectedStrategy, setSelectedStrategy] = React.useState<BasketStrategy>("CHEAPEST");
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [basketName, setBasketName] = React.useState("");

  // Preload recipe from ?recipeId=
  const urlRecipe = useQuery({
    queryKey: ["recipe", urlRecipeId],
    queryFn: () => api<RecipeDto>(`/recipes/${urlRecipeId}`),
    enabled: !!urlRecipeId,
  });
  React.useEffect(() => {
    if (urlRecipe.data && !recipe) {
      setRecipe(urlRecipe.data);
      setMode("recipe");
    }
  }, [urlRecipe.data, recipe]);

  const optimize = useMutation({
    mutationFn: () =>
      api<{ results: OptimizationResult[] }>("/baskets/optimize", {
        method: "POST",
        body: {
          recipeId: mode === "recipe" ? recipe?.id : undefined,
          ingredientNames: mode === "ingredients" ? draftIngredients : undefined,
          strategy: selectedStrategy,
          servingsMultiplier: multiplier,
          excludeStores: excludedStores,
          usePantry,
        },
      }),
    onSuccess: (data) => {
      setResults(data.results);
      const best = data.results.find((r) => r.strategy === "CHEAPEST") ?? data.results[0];
      if (best) setSelectedStrategy(best.strategy);
      toast.success("Baskets optimized across all strategies");
    },
    onError: (e) => handleApiError(e, "Optimization failed"),
  });

  const saveBasket = useMutation({
    mutationFn: () => {
      const result = results!.find((r) => r.strategy === selectedStrategy)!;
      return api<BasketDto>("/baskets", {
        method: "POST",
        body: {
          name: basketName.trim(),
          strategy: selectedStrategy,
          recipeId: mode === "recipe" ? (recipe?.id ?? undefined) : undefined,
          result,
        },
      });
    },
    onSuccess: (basket) => {
      toast.success("Basket saved — happy shopping!");
      router.push(`/baskets/${basket.id}`);
    },
    onError: (e) => handleApiError(e, "Could not save basket"),
  });

  const canOptimize =
    mode === "recipe" ? !!recipe : draftIngredients.length > 0;

  const selected = results?.find((r) => r.strategy === selectedStrategy) ?? null;

  const grouped = React.useMemo(() => {
    if (!selected) return [];
    return selected.storeBreakdown.map((sb) => ({
      ...sb,
      items: selected.items.filter(
        (item) => !item.unmatched && item.product?.store?.code === sb.storeCode,
      ),
    }));
  }, [selected]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Optimize your basket</h2>
        <p className="text-sm text-muted-foreground">
          We&apos;ll price your ingredients across 7 stores and build four baskets to choose from.
        </p>
      </div>

      {/* Source picker */}
      <Card>
        <CardContent className="space-y-5 p-5">
          <Tabs value={mode} onValueChange={(v) => setMode(v as "recipe" | "ingredients")}>
            <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-grid">
              <TabsTrigger value="recipe">
                <BookOpen aria-hidden /> From recipe
              </TabsTrigger>
              <TabsTrigger value="ingredients">
                <ListPlus aria-hidden /> Ad-hoc ingredients
              </TabsTrigger>
            </TabsList>
            <TabsContent value="recipe" className="mt-3">
              {urlRecipeId && urlRecipe.isLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <RecipePicker selected={recipe} onSelect={setRecipe} />
              )}
            </TabsContent>
            <TabsContent value="ingredients" className="mt-3 space-y-1.5">
              <TagInput
                value={draftIngredients}
                onChange={setDraftIngredients}
                placeholder="Type an ingredient and press Enter — e.g. chicken thigh"
                aria-label="Ingredients to optimize"
                fetchSuggestions={async (q) => {
                  const hits = await api<IngredientSearchHit[]>("/ingredients/search", {
                    query: { q },
                  });
                  return hits.map((h) => h.displayName || h.name);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Your list is saved on this device until you optimize.
              </p>
            </TabsContent>
          </Tabs>

          {/* Options row */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Servings multiplier</Label>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setMultiplier((m) => Math.max(0.5, +(m - 0.5).toFixed(2)))}
                  disabled={multiplier <= 0.5}
                  aria-label="Decrease servings multiplier"
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <span className="w-14 text-center text-sm font-semibold tabular-nums">
                  {multiplier}×
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => setMultiplier((m) => Math.min(20, +(m + 0.5).toFixed(2)))}
                  disabled={multiplier >= 20}
                  aria-label="Increase servings multiplier"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="use-pantry">Use pantry</Label>
              <div className="flex h-9 items-center gap-2.5">
                <Switch id="use-pantry" checked={usePantry} onCheckedChange={setUsePantry} />
                <span className="text-sm text-muted-foreground">
                  Skip items you already have
                </span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Exclude stores</Label>
              <div className="flex flex-wrap gap-1.5">
                {STORE_CODES.map((code) => {
                  const excluded = excludedStores.includes(code);
                  return (
                    <button
                      key={code}
                      type="button"
                      aria-pressed={excluded}
                      onClick={() =>
                        setExcludedStores((prev) =>
                          excluded ? prev.filter((c) => c !== code) : [...prev, code],
                        )
                      }
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        excluded
                          ? "border-destructive/40 bg-destructive/10 text-destructive line-through"
                          : "hover:bg-accent",
                      )}
                    >
                      {storeName(code)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <Button
            size="lg"
            disabled={!canOptimize || optimize.isPending}
            onClick={() => optimize.mutate()}
            className="w-full sm:w-auto"
          >
            {optimize.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles aria-hidden />
            )}
            Optimize
          </Button>
        </CardContent>
      </Card>

      {/* Loading skeletons */}
      {optimize.isPending && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      )}

      {/* Results */}
      {results && !optimize.isPending && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {results.map((r) => {
              const meta = STRATEGY_META[r.strategy];
              const active = r.strategy === selectedStrategy;
              return (
                <button
                  key={r.strategy}
                  type="button"
                  onClick={() => setSelectedStrategy(r.strategy)}
                  aria-pressed={active}
                  className={cn(
                    "rounded-xl border bg-card p-4 text-left shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "border-primary ring-2 ring-primary/30"
                      : "hover:border-primary/40 hover:shadow-md",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xl" aria-hidden>
                      {meta.emoji}
                    </span>
                    {r.savingsCents > 0 && (
                      <Badge variant="success">Save {formatSGD(r.savingsCents)} vs avg</Badge>
                    )}
                  </div>
                  <p className="mt-2 font-semibold">{meta.label}</p>
                  <p className="text-2xl font-bold tracking-tight">
                    {formatSGD(r.grandTotalCents)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.storeCount} {r.storeCount === 1 ? "store" : "stores"} · delivery{" "}
                    {formatSGD(r.deliveryCents)}
                  </p>
                </button>
              );
            })}
          </div>

          {selected && (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                <div>
                  <CardTitle className="text-base">
                    {STRATEGY_META[selected.strategy].emoji}{" "}
                    {STRATEGY_META[selected.strategy].label} breakdown
                  </CardTitle>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {STRATEGY_META[selected.strategy].description}
                  </p>
                </div>
                <Button onClick={() => {
                  setBasketName(
                    recipe && mode === "recipe"
                      ? `${recipe.title} — ${STRATEGY_META[selected.strategy].label}`
                      : `Groceries — ${STRATEGY_META[selected.strategy].label}`,
                  );
                  setSaveOpen(true);
                }}>
                  <Save aria-hidden /> Save basket
                </Button>
              </CardHeader>
              <CardContent className="space-y-5">
                {selected.unmatchedIngredients.length > 0 && (
                  <Alert variant="warning">
                    <AlertTriangle aria-hidden />
                    <AlertTitle>
                      {selected.unmatchedIngredients.length} ingredient
                      {selected.unmatchedIngredients.length === 1 ? "" : "s"} couldn&apos;t be
                      matched
                    </AlertTitle>
                    <AlertDescription>
                      {selected.unmatchedIngredients.join(", ")} — add these manually while
                      shopping.
                    </AlertDescription>
                  </Alert>
                )}

                {grouped.map((group) => (
                  <div key={group.storeCode} className="rounded-lg border">
                    <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <StoreBadge code={group.storeCode} />
                        <span className="text-xs text-muted-foreground">
                          {group.itemCount} {group.itemCount === 1 ? "item" : "items"}
                        </span>
                      </div>
                      <div className="text-sm">
                        <span className="font-semibold">{formatSGD(group.subtotalCents)}</span>
                        {group.deliveryCents > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {" "}
                            + {formatSGD(group.deliveryCents)} delivery
                          </span>
                        )}
                      </div>
                    </div>
                    <ul className="divide-y">
                      {group.items.map((item, idx) => (
                        <li
                          key={`${group.storeCode}-${idx}`}
                          className="flex items-center justify-between gap-3 px-4 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
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
                                ? `${item.product.packSize}${item.product.packUnit.toLowerCase()} pack`
                                : ""}
                              {item.requiredQtyG
                                ? ` · needs ${formatGrams(item.requiredQtyG)}`
                                : ""}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-sm font-semibold">{formatSGD(item.totalCents)}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.quantity} × {formatSGD(item.unitPriceCents)}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}

                <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
                  <span className="text-sm font-medium">
                    Grand total ({selected.storeCount}{" "}
                    {selected.storeCount === 1 ? "store" : "stores"})
                  </span>
                  <span className="text-lg font-bold">{formatSGD(selected.grandTotalCents)}</span>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Save dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save basket</DialogTitle>
            <DialogDescription>
              Give this basket a name — you&apos;ll find it under Baskets with a shopping
              checklist.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="basket-name">Basket name</Label>
            <Input
              id="basket-name"
              value={basketName}
              onChange={(e) => setBasketName(e.target.value)}
              placeholder="e.g. Sunday meal prep"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!basketName.trim() || saveBasket.isPending}
              onClick={() => saveBasket.mutate()}
            >
              {saveBasket.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save basket
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function OptimizePage() {
  return (
    <React.Suspense
      fallback={
        <div className="space-y-5">
          <Skeleton className="h-8 w-60" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      }
    >
      <OptimizeInner />
    </React.Suspense>
  );
}
