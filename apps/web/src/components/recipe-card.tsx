"use client";

import Image from "next/image";
import Link from "next/link";
import { Clock, Flame, RefreshCcw } from "lucide-react";
import type { RecipeDto } from "@smart-grocery/shared";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

const GRADIENTS = [
  "from-emerald-400 to-teal-600",
  "from-sky-400 to-indigo-600",
  "from-amber-400 to-orange-600",
  "from-rose-400 to-pink-600",
  "from-violet-400 to-purple-600",
];

function gradientFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return GRADIENTS[Math.abs(hash) % GRADIENTS.length]!;
}

interface RecipeCardProps {
  recipe: Pick<
    RecipeDto,
    "id" | "title" | "imageUrl" | "tags" | "nutrition" | "status" | "prepMinutes" | "cookMinutes"
  > &
    Partial<Pick<RecipeDto, "failureReason">>;
  footer?: React.ReactNode;
  onRetry?: () => void;
  retrying?: boolean;
}

export function RecipeCard({ recipe, footer, onRetry, retrying }: RecipeCardProps) {
  const totalMinutes = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);

  return (
    <Card className="group overflow-hidden transition-shadow hover:shadow-md">
      <Link
        href={`/recipes/${recipe.id}`}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="relative aspect-[16/9] w-full overflow-hidden">
          {recipe.imageUrl ? (
            <Image
              src={recipe.imageUrl}
              alt={recipe.title}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              // External CDNs (Wikimedia) reject the Next image proxy's requests;
              // let the browser fetch them directly.
              unoptimized
            />
          ) : (
            <div
              className={cn(
                "flex h-full w-full items-center justify-center bg-gradient-to-br",
                gradientFor(recipe.id),
              )}
            >
              <span className="text-3xl font-bold text-white/90">{initials(recipe.title)}</span>
            </div>
          )}
          {recipe.status === "PROCESSING" && (
            <Badge variant="warning" className="absolute left-2 top-2 animate-pulse">
              Processing
            </Badge>
          )}
          {recipe.status === "FAILED" && (
            <Badge variant="destructive" className="absolute left-2 top-2">
              Failed
            </Badge>
          )}
        </div>
        <CardContent className="space-y-2 p-4">
          <h3 className="line-clamp-2 font-semibold leading-snug">{recipe.title}</h3>
          <div className="flex flex-wrap items-center gap-1.5">
            {recipe.nutrition ? (
              <>
                <Badge variant="secondary">
                  <Flame aria-hidden />
                  {Math.round(recipe.nutrition.calories)} kcal
                </Badge>
                <Badge variant="secondary">{Math.round(recipe.nutrition.proteinG)}g protein</Badge>
              </>
            ) : null}
            {totalMinutes > 0 && (
              <Badge variant="secondary">
                <Clock aria-hidden />
                {totalMinutes} min
              </Badge>
            )}
            {recipe.tags.slice(0, 2).map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Link>
      {(footer || (recipe.status === "FAILED" && onRetry)) && (
        <div className="border-t px-4 py-2.5">
          {recipe.status === "FAILED" && onRetry ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              disabled={retrying}
              className="w-full"
            >
              <RefreshCcw className={cn("h-3.5 w-3.5", retrying && "animate-spin")} />
              Retry extraction
            </Button>
          ) : (
            footer
          )}
        </div>
      )}
    </Card>
  );
}
