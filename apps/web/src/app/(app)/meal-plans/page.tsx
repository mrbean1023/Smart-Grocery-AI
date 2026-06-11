"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Flame, Sparkles, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import type { MealPlanDto, MealPlanPeriod } from "@smart-grocery/shared";
import { DIETARY_RESTRICTIONS } from "@smart-grocery/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
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
import { handleApiError } from "@/lib/errors";
import { formatDate, formatSGD } from "@/lib/format";
import { cn } from "@/lib/utils";

const PERIOD_LABEL: Record<MealPlanPeriod, string> = {
  DAILY: "1 day",
  WEEKLY: "1 week",
  MONTHLY: "4 weeks",
};

interface GenerateForm {
  period: MealPlanPeriod;
  startDate: string;
  budget: string;
  calories: string;
  protein: string;
  mealsPerDay: string;
  restrictions: string[];
}

export default function MealPlansPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<GenerateForm>({
    period: "WEEKLY",
    startDate: new Date().toISOString().slice(0, 10),
    budget: "",
    calories: "",
    protein: "",
    mealsPerDay: "3",
    restrictions: [],
  });

  const { data: rawPlans, isLoading } = useQuery({
    queryKey: ["meal-plans"],
    queryFn: () => api<MealPlanDto[] | { items: MealPlanDto[] }>("/meal-plans"),
  });
  const plans: MealPlanDto[] = Array.isArray(rawPlans) ? rawPlans : (rawPlans?.items ?? []);

  const generate = useMutation({
    mutationFn: () =>
      api<MealPlanDto>("/meal-plans/generate", {
        method: "POST",
        body: {
          period: form.period,
          startDate: form.startDate,
          ...(form.budget ? { budgetCents: Math.round(Number(form.budget) * 100) } : {}),
          ...(form.calories ? { targetCalories: Number(form.calories) } : {}),
          ...(form.protein ? { targetProteinG: Number(form.protein) } : {}),
          mealsPerDay: Number(form.mealsPerDay),
          dietaryRestrictions: form.restrictions,
          usePantry: true,
        },
      }),
    onSuccess: (plan) => {
      toast.success("Meal plan ready");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["meal-plans"] });
      router.push(`/meal-plans/${plan.id}`);
    },
    onError: (e) => handleApiError(e, "Could not generate a plan"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/meal-plans/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Plan deleted");
      qc.invalidateQueries({ queryKey: ["meal-plans"] });
    },
    onError: (e) => handleApiError(e),
  });

  const toggleRestriction = (r: string) =>
    setForm((f) => ({
      ...f,
      restrictions: f.restrictions.includes(r)
        ? f.restrictions.filter((x) => x !== r)
        : [...f.restrictions, r],
    }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Budget-aware meal plans built from your recipes, pantry and nutrition goals.
        </p>
        <Button onClick={() => setOpen(true)}>
          <Sparkles aria-hidden /> Generate plan
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : plans.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No meal plans yet"
          description="Tell us your budget and goals — we'll plan your week around the cheapest healthy options."
          action={
            <Button onClick={() => setOpen(true)}>
              <Sparkles aria-hidden /> Generate your first plan
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {plans.map((p) => (
            <Card key={p.id} className="group relative transition-shadow hover:shadow-md">
              <Link
                href={`/meal-plans/${p.id}`}
                className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Open ${p.name}`}
              />
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="min-w-0 truncate font-semibold">{p.name}</h3>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="relative z-10 opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label={`Delete ${p.name}`}
                    onClick={() => remove.mutate(p.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  {PERIOD_LABEL[p.period]} · {formatDate(p.startDate)} → {formatDate(p.endDate)}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span className="flex items-center gap-1">
                    <Wallet className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    est. {formatSGD(p.estimatedCostCents)}
                    {p.budgetCents ? ` / ${formatSGD(p.budgetCents)}` : ""}
                  </span>
                  {p.targetCalories && (
                    <span className="flex items-center gap-1">
                      <Flame className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      {p.targetCalories} kcal/day
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Generate a meal plan</DialogTitle>
            <DialogDescription>
              We pick recipes that fit your budget, calories and dietary needs.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              generate.mutate();
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Period</Label>
                <Select
                  value={form.period}
                  onValueChange={(v) => setForm({ ...form, period: v as MealPlanPeriod })}
                >
                  <SelectTrigger aria-label="Plan period">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DAILY">Daily</SelectItem>
                    <SelectItem value="WEEKLY">Weekly</SelectItem>
                    <SelectItem value="MONTHLY">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mp-start">Start date</Label>
                <Input
                  id="mp-start"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="mp-budget">Budget (S$)</Label>
                <Input
                  id="mp-budget"
                  type="number"
                  min="5"
                  step="1"
                  placeholder="80"
                  value={form.budget}
                  onChange={(e) => setForm({ ...form, budget: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mp-cal">Calories/day</Label>
                <Input
                  id="mp-cal"
                  type="number"
                  min="800"
                  step="50"
                  placeholder="2000"
                  value={form.calories}
                  onChange={(e) => setForm({ ...form, calories: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mp-protein">Protein g/day</Label>
                <Input
                  id="mp-protein"
                  type="number"
                  min="0"
                  step="5"
                  placeholder="120"
                  value={form.protein}
                  onChange={(e) => setForm({ ...form, protein: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Meals per day</Label>
              <Select value={form.mealsPerDay} onValueChange={(v) => setForm({ ...form, mealsPerDay: v })}>
                <SelectTrigger aria-label="Meals per day">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["1", "2", "3", "4"].map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Dietary restrictions</Label>
              <div className="flex flex-wrap gap-1.5">
                {DIETARY_RESTRICTIONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleRestriction(r)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      form.restrictions.includes(r)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-accent",
                    )}
                    aria-pressed={form.restrictions.includes(r)}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={generate.isPending}>
                {generate.isPending ? "Planning your meals…" : "Generate plan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
