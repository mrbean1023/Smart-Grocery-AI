"use client";

import * as React from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { ManualRecipeInput, RecipeDto } from "@smart-grocery/shared";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TagInput } from "@/components/tag-input";

const formSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(2000).optional(),
  servings: z.coerce.number().int().min(1).max(50),
  prepMinutes: z.coerce.number().int().min(0).max(1440).optional(),
  cookMinutes: z.coerce.number().int().min(0).max(1440).optional(),
  cuisine: z.string().max(50).optional(),
  tags: z.array(z.string().max(30)).max(15),
  ingredients: z
    .array(
      z.object({
        rawText: z.string().min(1, "Required").max(300),
        optional: z.boolean(),
      }),
    )
    .min(1, "Add at least one ingredient")
    .max(100),
  instructions: z.array(z.object({ text: z.string().max(2000) })).max(50),
});

type FormValues = z.infer<typeof formSchema>;

interface RecipeFormProps {
  recipe?: RecipeDto;
  onSubmit: (values: ManualRecipeInput) => void;
  submitting?: boolean;
  submitLabel?: string;
}

export function RecipeForm({
  recipe,
  onSubmit,
  submitting,
  submitLabel = "Save recipe",
}: RecipeFormProps) {
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: recipe?.title ?? "",
      description: recipe?.description ?? "",
      servings: recipe?.servings ?? 2,
      prepMinutes: recipe?.prepMinutes ?? undefined,
      cookMinutes: recipe?.cookMinutes ?? undefined,
      cuisine: recipe?.cuisine ?? "",
      tags: recipe?.tags ?? [],
      ingredients: recipe?.ingredients.length
        ? recipe.ingredients.map((i) => ({ rawText: i.rawText, optional: i.optional }))
        : [{ rawText: "", optional: false }],
      instructions: recipe?.instructions.length
        ? recipe.instructions.map((text) => ({ text }))
        : [{ text: "" }],
    },
  });

  const ingredients = useFieldArray({ control, name: "ingredients" });
  const instructions = useFieldArray({ control, name: "instructions" });
  const tags = watch("tags");

  const submit = handleSubmit((values) => {
    const payload: ManualRecipeInput = {
      title: values.title,
      description: values.description?.trim() || undefined,
      servings: values.servings,
      prepMinutes: values.prepMinutes ?? undefined,
      cookMinutes: values.cookMinutes ?? undefined,
      cuisine: values.cuisine?.trim() || undefined,
      tags: values.tags,
      instructions: values.instructions.map((s) => s.text.trim()).filter(Boolean),
      ingredients: values.ingredients
        .filter((i) => i.rawText.trim())
        .map((i) => ({ rawText: i.rawText.trim(), optional: i.optional })),
    };
    onSubmit(payload);
  });

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="recipe-title">Title</Label>
          <Input
            id="recipe-title"
            placeholder="e.g. Hainanese Chicken Rice"
            {...register("title")}
          />
          {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="recipe-description">Description (optional)</Label>
          <Textarea
            id="recipe-description"
            rows={2}
            placeholder="A short note about this dish"
            {...register("description")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="recipe-servings">Servings</Label>
          <Input id="recipe-servings" type="number" min={1} max={50} {...register("servings")} />
          {errors.servings && (
            <p className="text-xs text-destructive">{errors.servings.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="recipe-cuisine">Cuisine (optional)</Label>
          <Input id="recipe-cuisine" placeholder="e.g. Singaporean" {...register("cuisine")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="recipe-prep">Prep minutes</Label>
          <Input id="recipe-prep" type="number" min={0} {...register("prepMinutes")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="recipe-cook">Cook minutes</Label>
          <Input id="recipe-cook" type="number" min={0} {...register("cookMinutes")} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="recipe-tags">Tags</Label>
          <TagInput
            id="recipe-tags"
            value={tags}
            onChange={(t) => setValue("tags", t, { shouldDirty: true })}
            placeholder="Press Enter to add — e.g. spicy, weeknight"
            aria-label="Recipe tags"
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Ingredients</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => ingredients.append({ rawText: "", optional: false })}
          >
            <Plus className="h-3.5 w-3.5" /> Add ingredient
          </Button>
        </div>
        {errors.ingredients?.root?.message && (
          <p className="text-xs text-destructive">{errors.ingredients.root.message}</p>
        )}
        <div className="space-y-2">
          {ingredients.fields.map((field, index) => (
            <div key={field.id} className="flex items-center gap-2">
              <Input
                placeholder="e.g. 2 chicken thighs"
                aria-label={`Ingredient ${index + 1}`}
                {...register(`ingredients.${index}.rawText`)}
              />
              <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                <Checkbox
                  checked={watch(`ingredients.${index}.optional`)}
                  onCheckedChange={(v) =>
                    setValue(`ingredients.${index}.optional`, v === true, { shouldDirty: true })
                  }
                  aria-label={`Ingredient ${index + 1} optional`}
                />
                Optional
              </label>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => ingredients.remove(index)}
                disabled={ingredients.fields.length === 1}
                aria-label={`Remove ingredient ${index + 1}`}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Instructions</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => instructions.append({ text: "" })}
          >
            <Plus className="h-3.5 w-3.5" /> Add step
          </Button>
        </div>
        <div className="space-y-2">
          {instructions.fields.map((field, index) => (
            <div key={field.id} className="flex items-start gap-2">
              <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {index + 1}
              </span>
              <Textarea
                rows={2}
                placeholder={`Step ${index + 1}`}
                aria-label={`Instruction step ${index + 1}`}
                {...register(`instructions.${index}.text`)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => instructions.remove(index)}
                disabled={instructions.fields.length === 1}
                aria-label={`Remove step ${index + 1}`}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  );
}
