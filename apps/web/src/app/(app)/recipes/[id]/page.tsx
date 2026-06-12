"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Clock,
  Loader2,
  Minus,
  Pencil,
  Plus,
  RefreshCcw,
  ScanSearch,
  Sparkles,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { ManualRecipeInput, RecipeDto, RecipeIngredientDto } from "@smart-grocery/shared";

import { HealthGauge } from "@/components/health-gauge";
import { RecipeForm } from "@/components/recipe-form";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { handleApiError } from "@/lib/errors";
import { formatGrams } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Substitution {
  id: string;
  name: string;
  displayName?: string;
  note?: string;
  ratio?: number;
}

function confidenceClasses(confidence: number | null): string {
  if (confidence === null) return "bg-muted text-muted-foreground";
  if (confidence >= 0.8)
    return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300";
  if (confidence >= 0.5)
    return "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300";
  return "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300";
}

function SubstitutionsPopover({ ingredient }: { ingredient: RecipeIngredientDto }) {
  const [open, setOpen] = React.useState(false);
  const ingredientId = ingredient.ingredient?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["ingredient-substitutions", ingredientId],
    queryFn: () => api<Substitution[]>(`/ingredients/${ingredientId}/substitutions`),
    enabled: open && !!ingredientId,
  });

  if (!ingredientId) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label={`Substitutions for ${ingredient.ingredient?.displayName ?? ingredient.rawText}`}
        >
          <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <p className="mb-2 text-sm font-semibold">Substitutions</p>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : (data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">
            No known substitutes for this ingredient.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {data!.map((s) => (
              <li key={s.id} className="text-sm">
                <span className="font-medium">{s.displayName ?? s.name}</span>
                {s.note && <span className="block text-xs text-muted-foreground">{s.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ProcessingState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-5 py-16 text-center">
        <div className="relative">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <ScanSearch className="h-7 w-7 animate-pulse text-primary" aria-hidden />
          </div>
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" aria-hidden />
        </div>
        <div className="space-y-1.5">
          <p className="text-lg font-semibold">Extracting your recipe…</p>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            Our AI is reading ingredients, quantities and steps, then matching them to products
            across 7 stores. This usually takes under a minute.
          </p>
        </div>
        <div className="flex gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 w-2 animate-bounce rounded-full bg-primary"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function RecipeDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = params.id;

  const [servings, setServings] = React.useState<number | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const { data: recipe, isLoading } = useQuery({
    queryKey: ["recipe", id],
    queryFn: () => api<RecipeDto>(`/recipes/${id}`),
    refetchInterval: (query) => (query.state.data?.status === "PROCESSING" ? 3000 : false),
  });

  const displayServings = servings ?? recipe?.servings ?? 2;
  const multiplier = recipe ? displayServings / recipe.servings : 1;

  const reprocess = useMutation({
    mutationFn: () => api(`/recipes/${id}/reprocess`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Re-running extraction…");
      void queryClient.invalidateQueries({ queryKey: ["recipe", id] });
    },
    onError: (e) => handleApiError(e, "Could not retry extraction"),
  });

  const update = useMutation({
    mutationFn: (body: ManualRecipeInput) =>
      api<RecipeDto>(`/recipes/${id}`, { method: "PATCH", body }),
    onSuccess: () => {
      toast.success("Recipe updated");
      setEditOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["recipe", id] });
      void queryClient.invalidateQueries({ queryKey: ["recipes"] });
    },
    onError: (e) => handleApiError(e, "Could not update recipe"),
  });

  const remove = useMutation({
    mutationFn: () => api(`/recipes/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Recipe deleted");
      void queryClient.invalidateQueries({ queryKey: ["recipes"] });
      router.push("/recipes");
    },
    onError: (e) => handleApiError(e, "Could not delete recipe"),
  });

  if (isLoading || !recipe) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-5 w-1/3" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-80 rounded-xl lg:col-span-2" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  if (recipe.status === "PROCESSING") {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <h2 className="text-2xl font-bold tracking-tight">{recipe.title}</h2>
        <ProcessingState />
      </div>
    );
  }

  if (recipe.status === "FAILED") {
    return (
      <div className="mx-auto max-w-2xl space-y-5">
        <h2 className="text-2xl font-bold tracking-tight">{recipe.title}</h2>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <XCircle className="h-10 w-10 text-destructive" aria-hidden />
            <div>
              <p className="text-lg font-semibold">Extraction failed</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                {recipe.failureReason ??
                  "We couldn't read this recipe. Try again or add it manually."}
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => reprocess.mutate()} disabled={reprocess.isPending}>
                <RefreshCcw className={cn(reprocess.isPending && "animate-spin")} aria-hidden />
                Retry extraction
              </Button>
              <Button variant="outline" onClick={() => setDeleteOpen(true)}>
                <Trash2 aria-hidden /> Delete
              </Button>
            </div>
          </CardContent>
        </Card>
        <DeleteDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          onConfirm={() => remove.mutate()}
          pending={remove.isPending}
        />
      </div>
    );
  }

  const totalMinutes = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">{recipe.title}</h2>
          {recipe.description && (
            <p className="max-w-2xl text-sm text-muted-foreground">{recipe.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {totalMinutes > 0 && (
              <Badge variant="secondary">
                <Clock aria-hidden /> {totalMinutes} min
              </Badge>
            )}
            {recipe.cuisine && <Badge variant="secondary">{recipe.cuisine}</Badge>}
            {recipe.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        {/* Servings stepper */}
        <div className="flex shrink-0 items-center gap-3 rounded-lg border px-3 py-2">
          <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="text-sm text-muted-foreground">Servings</span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setServings(Math.max(1, displayServings - 1))}
              disabled={displayServings <= 1}
              aria-label="Decrease servings"
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <span className="w-8 text-center text-sm font-semibold tabular-nums">
              {displayServings}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setServings(Math.min(50, displayServings + 1))}
              aria-label="Increase servings"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* CTA bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild>
          <Link
            href={`/optimize?recipeId=${recipe.id}${multiplier !== 1 ? `&multiplier=${multiplier.toFixed(2)}` : ""}`}
          >
            <Sparkles aria-hidden /> Optimize basket
          </Link>
        </Button>
        <Button variant="outline" onClick={() => setEditOpen(true)}>
          <Pencil aria-hidden /> Edit
        </Button>
        <Button
          variant="outline"
          className="text-destructive hover:text-destructive"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 aria-hidden /> Delete
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {recipe.imageUrl && (
            <div className="relative aspect-[16/9] overflow-hidden rounded-xl border">
              <Image
                src={recipe.imageUrl}
                alt={recipe.title}
                fill
                sizes="(max-width: 1024px) 100vw, 66vw"
                className="object-cover"
                priority
                unoptimized
              />
            </div>
          )}

          {/* Ingredients */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Ingredients{" "}
                <span className="font-normal text-muted-foreground">
                  ({recipe.ingredients.length})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ingredient</TableHead>
                    <TableHead>Matched</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="w-10">
                      <span className="sr-only">Substitutions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recipe.ingredients.map((ing) => (
                    <TableRow key={ing.id}>
                      <TableCell className="max-w-[260px]">
                        <span className="block truncate text-sm">{ing.rawText}</span>
                        {ing.optional && (
                          <span className="text-xs text-muted-foreground">optional</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {ing.ingredient ? (
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                              confidenceClasses(ing.matchConfidence),
                            )}
                            title={
                              ing.matchConfidence !== null
                                ? `Match confidence ${(ing.matchConfidence * 100).toFixed(0)}%`
                                : undefined
                            }
                          >
                            {ing.ingredient.displayName}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">unmatched</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {ing.normalizedQtyG !== null
                          ? formatGrams(ing.normalizedQtyG * multiplier)
                          : ing.quantity !== null
                            ? `${(ing.quantity * multiplier) % 1 === 0 ? ing.quantity * multiplier : (ing.quantity * multiplier).toFixed(1)} ${ing.unit ?? ""}`.trim()
                            : "—"}
                      </TableCell>
                      <TableCell>
                        <SubstitutionsPopover ingredient={ing} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Instructions */}
          {recipe.instructions.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Instructions</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-4">
                  {recipe.instructions.map((step, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                        {i + 1}
                      </span>
                      <p className="pt-0.5 text-sm leading-relaxed">{step}</p>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Nutrition */}
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Nutrition per serving</CardTitle>
            </CardHeader>
            <CardContent>
              {recipe.nutrition ? (
                <div className="space-y-5">
                  <div className="flex justify-center">
                    <HealthGauge score={recipe.nutrition.healthScore} />
                  </div>
                  <dl className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Calories", value: `${Math.round(recipe.nutrition.calories)} kcal` },
                      { label: "Protein", value: `${Math.round(recipe.nutrition.proteinG)} g` },
                      { label: "Carbs", value: `${Math.round(recipe.nutrition.carbsG)} g` },
                      { label: "Fat", value: `${Math.round(recipe.nutrition.fatG)} g` },
                      { label: "Fibre", value: `${Math.round(recipe.nutrition.fibreG)} g` },
                      { label: "Sugar", value: `${Math.round(recipe.nutrition.sugarG)} g` },
                      { label: "Sodium", value: `${Math.round(recipe.nutrition.sodiumMg)} mg` },
                    ].map((row) => (
                      <div key={row.label} className="rounded-lg bg-muted/60 px-3 py-2">
                        <dt className="text-xs text-muted-foreground">{row.label}</dt>
                        <dd className="text-sm font-semibold">{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nutrition data isn&apos;t available for this recipe yet.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit recipe</DialogTitle>
            <DialogDescription>
              Editing ingredients re-runs product matching afterwards.
            </DialogDescription>
          </DialogHeader>
          <RecipeForm
            recipe={recipe}
            onSubmit={(values) => update.mutate(values)}
            submitting={update.isPending}
            submitLabel="Save changes"
          />
        </DialogContent>
      </Dialog>

      <DeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={() => remove.mutate()}
        pending={remove.isPending}
      />
    </div>
  );
}

function DeleteDialog({
  open,
  onOpenChange,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete this recipe?</DialogTitle>
          <DialogDescription>
            This permanently removes the recipe and its extracted ingredients. Saved baskets are
            kept.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Delete recipe
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
