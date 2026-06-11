"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import type { Paginated, RecipeDto } from "@smart-grocery/shared";

import { RecipeCard } from "@/components/recipe-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { handleApiError } from "@/lib/errors";

const PAGE_SIZE = 12;

export default function RecipesPage() {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);

  // Debounce search input
  React.useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["recipes", { page, search }],
    queryFn: () =>
      api<Paginated<RecipeDto>>("/recipes", {
        query: { page, pageSize: PAGE_SIZE, search: search || undefined },
      }),
    placeholderData: (prev) => prev,
    refetchInterval: (query) =>
      query.state.data?.items.some((r) => r.status === "PROCESSING") ? 5000 : false,
  });

  const reprocess = useMutation({
    mutationFn: (id: string) => api(`/recipes/${id}/reprocess`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Re-running extraction…");
      void queryClient.invalidateQueries({ queryKey: ["recipes"] });
    },
    onError: (e) => handleApiError(e, "Could not retry extraction"),
  });

  const recipes = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search recipes…"
            className="pl-9"
            aria-label="Search recipes"
          />
        </div>
        <Button asChild>
          <Link href="/recipes/new">
            <Plus aria-hidden /> Add recipe
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="aspect-[16/9] w-full rounded-xl" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      ) : recipes.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={search ? "No recipes match your search" : "No recipes yet"}
          description={
            search
              ? "Try a different keyword, or add this recipe from a photo, URL or text."
              : "Scan a photo, import a URL or type one in — we'll extract the ingredients and price them across 7 stores."
          }
          action={
            <Button asChild>
              <Link href="/recipes/new">
                <Plus aria-hidden /> Add your first recipe
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recipes.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                onRetry={
                  recipe.status === "FAILED" ? () => reprocess.mutate(recipe.id) : undefined
                }
                retrying={reprocess.isPending && reprocess.variables === recipe.id}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage((p) => p - 1)}
                aria-label="Previous page"
              >
                <ChevronLeft aria-hidden /> Prev
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || isFetching}
                onClick={() => setPage((p) => p + 1)}
                aria-label="Next page"
              >
                Next <ChevronRight aria-hidden />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
