"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, eachDayOfInterval, format, isSameDay } from "date-fns";
import { CalendarDays, Flame, RefreshCw, Search, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import type { MealPlanDto, MealPlanSlotDto, MealType, Paginated, RecipeDto } from "@smart-grocery/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { handleApiError } from "@/lib/errors";
import { formatDate, formatSGD } from "@/lib/format";
import { cn } from "@/lib/utils";

const MEAL_ORDER: MealType[] = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"];
const MEAL_LABEL: Record<MealType, string> = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  DINNER: "Dinner",
  SNACK: "Snack",
};

export default function MealPlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [swapSlot, setSwapSlot] = React.useState<MealPlanSlotDto | null>(null);

  const { data: plan, isLoading } = useQuery({
    queryKey: ["meal-plan", id],
    queryFn: () => api<MealPlanDto>(`/meal-plans/${id}`),
  });

  const remove = useMutation({
    mutationFn: () => api(`/meal-plans/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Plan deleted");
      qc.invalidateQueries({ queryKey: ["meal-plans"] });
      router.push("/meal-plans");
    },
    onError: (e) => handleApiError(e),
  });

  const swap = useMutation({
    mutationFn: ({ slotId, recipeId }: { slotId: string; recipeId: string }) =>
      api(`/meal-plans/${id}/slots/${slotId}`, { method: "PATCH", body: { recipeId } }),
    onSuccess: () => {
      toast.success("Meal swapped");
      setSwapSlot(null);
      qc.invalidateQueries({ queryKey: ["meal-plan", id] });
    },
    onError: (e) => handleApiError(e, "Could not swap that meal"),
  });

  if (isLoading || !plan) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  const days = eachDayOfInterval({
    start: new Date(plan.startDate),
    end: new Date(plan.endDate),
  }).slice(0, plan.period === "MONTHLY" ? 28 : plan.period === "WEEKLY" ? 7 : 1);

  const mealsUsed = MEAL_ORDER.filter((m) => plan.slots.some((s) => s.mealType === m));
  const budgetPct = plan.budgetCents
    ? Math.min(100, Math.round((plan.estimatedCostCents / plan.budgetCents) * 100))
    : null;

  const dailyCalories =
    plan.slots.reduce((sum, s) => sum + (s.recipe?.nutrition?.calories ?? 0) * s.servings, 0) /
    Math.max(1, days.length);

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">{plan.name}</h2>
            <p className="text-sm text-muted-foreground">
              {formatDate(plan.startDate)} → {formatDate(plan.endDate)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <div className="min-w-44 space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Wallet className="h-3.5 w-3.5" aria-hidden /> Est. cost
                </span>
                <span className="font-medium">
                  {formatSGD(plan.estimatedCostCents)}
                  {plan.budgetCents ? ` / ${formatSGD(plan.budgetCents)}` : ""}
                </span>
              </div>
              {budgetPct !== null && (
                <Progress
                  value={budgetPct}
                  aria-label="Budget used"
                  indicatorClassName={cn(budgetPct >= 95 && "bg-destructive", budgetPct >= 80 && budgetPct < 95 && "bg-amber-500")}
                />
              )}
            </div>
            <div className="text-sm">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Flame className="h-3.5 w-3.5" aria-hidden /> Avg daily
              </span>
              <span className="font-medium">{Math.round(dailyCalories)} kcal</span>
            </div>
            <Button variant="outline" onClick={() => remove.mutate()} disabled={remove.isPending}>
              <Trash2 aria-hidden /> Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      {plan.slots.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="This plan has no meals"
          description="Generation could not find recipes matching the constraints. Try relaxing the budget or restrictions."
        />
      ) : (
        <div className="overflow-x-auto pb-2">
          <div
            className="grid min-w-[640px] gap-3"
            style={{ gridTemplateColumns: `repeat(${Math.min(days.length, 7)}, minmax(150px, 1fr))` }}
          >
            {days.slice(0, 7).map((day) => (
              <div key={day.toISOString()} className="space-y-2">
                <p className="text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {format(day, "EEE d MMM")}
                </p>
                {mealsUsed.map((meal) => {
                  const slot = plan.slots.find(
                    (s) => s.mealType === meal && isSameDay(new Date(s.date), day),
                  );
                  return (
                    <button
                      key={meal}
                      type="button"
                      onClick={() => slot && setSwapSlot(slot)}
                      disabled={!slot}
                      className={cn(
                        "w-full rounded-lg border p-2.5 text-left text-xs transition-colors",
                        slot ? "hover:border-primary/50 hover:bg-accent/50" : "border-dashed opacity-50",
                      )}
                    >
                      <p className="mb-1 font-medium text-muted-foreground">{MEAL_LABEL[meal]}</p>
                      {slot?.recipe ? (
                        <>
                          <p className="line-clamp-2 font-medium text-foreground">{slot.recipe.title}</p>
                          <p className="mt-1 text-muted-foreground">
                            {slot.recipe.nutrition
                              ? `${Math.round(slot.recipe.nutrition.calories * slot.servings)} kcal`
                              : ""}
                            {slot.servings > 1 ? ` · ${slot.servings} servings` : ""}
                          </p>
                        </>
                      ) : (
                        <p className="italic text-muted-foreground">Free slot</p>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          {days.length > 7 && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Showing week 1 of {Math.ceil(days.length / 7)} — weeks repeat the same structure with varied recipes.
            </p>
          )}
        </div>
      )}

      <SwapDialog
        slot={swapSlot}
        onClose={() => setSwapSlot(null)}
        onPick={(recipeId) => swapSlot && swap.mutate({ slotId: swapSlot.id, recipeId })}
        pending={swap.isPending}
      />
    </div>
  );
}

function SwapDialog({
  slot,
  onClose,
  onPick,
  pending,
}: {
  slot: MealPlanSlotDto | null;
  onClose: () => void;
  onPick: (recipeId: string) => void;
  pending: boolean;
}) {
  const [search, setSearch] = React.useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["recipes", "swap", search],
    queryFn: () => api<Paginated<RecipeDto>>("/recipes", { query: { search, pageSize: 8 } }),
    enabled: slot !== null,
  });

  return (
    <Dialog open={slot !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Swap this meal</DialogTitle>
          <DialogDescription>
            {slot ? `${MEAL_LABEL[slot.mealType]} · ${formatDate(slot.date)}` : ""}
            {slot?.recipe ? ` — currently ${slot.recipe.title}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your recipes…"
            className="pl-8"
            autoFocus
          />
        </div>
        <div className="max-h-72 space-y-1.5 overflow-y-auto">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)
          ) : (data?.items.length ?? 0) === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No matching recipes.</p>
          ) : (
            data!.items
              .filter((r) => r.status === "READY")
              .map((r) => (
                <button
                  key={r.id}
                  type="button"
                  disabled={pending}
                  onClick={() => onPick(r.id)}
                  className="flex w-full items-center justify-between rounded-lg border p-3 text-left text-sm transition-colors hover:border-primary/50 hover:bg-accent/50"
                >
                  <span className="min-w-0 truncate font-medium">{r.title}</span>
                  <span className="ml-2 flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    {r.nutrition ? `${Math.round(r.nutrition.calories)} kcal` : ""}
                    {pending ? <RefreshCw className="h-3 w-3 animate-spin" aria-hidden /> : null}
                  </span>
                </button>
              ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
