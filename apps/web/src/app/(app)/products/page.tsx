"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, PackageSearch, Search } from "lucide-react";
import type { Paginated, ProductDto, StoreCode, StoreDto } from "@smart-grocery/shared";

import { StoreBadge } from "@/components/store-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
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
import { formatPerKg, formatSGD } from "@/lib/format";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

export default function ProductsPage() {
  const router = useRouter();
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [selectedStores, setSelectedStores] = React.useState<StoreCode[]>([]);
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: stores } = useQuery({
    queryKey: ["stores"],
    queryFn: () => api<StoreDto[]>("/stores"),
    staleTime: 5 * 60_000,
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["products", { search, stores: selectedStores, page }],
    queryFn: () =>
      api<Paginated<ProductDto>>("/products/search", {
        query: {
          q: search || undefined,
          stores: selectedStores.length ? selectedStores : undefined,
          page,
          pageSize: PAGE_SIZE,
        },
      }),
    placeholderData: (prev) => prev,
  });

  const products = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;

  const toggleStore = (code: StoreCode) => {
    setPage(1);
    setSelectedStores((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="relative w-full sm:max-w-md">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search products — e.g. chicken breast, jasmine rice…"
            className="pl-9"
            aria-label="Search products"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => {
              setSelectedStores([]);
              setPage(1);
            }}
            aria-pressed={selectedStores.length === 0}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selectedStores.length === 0
                ? "border-primary bg-primary/10 text-primary"
                : "hover:bg-accent",
            )}
          >
            All stores
          </button>
          {(stores ?? []).map((store) => {
            const active = selectedStores.includes(store.code);
            return (
              <button
                key={store.code}
                type="button"
                onClick={() => toggleStore(store.code)}
                aria-pressed={active}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent",
                )}
              >
                {store.name}
              </button>
            );
          })}
        </div>
      </div>

      {isLoading ? (
        <Card className="divide-y">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4 p-4">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </Card>
      ) : products.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title={search ? "No products match your search" : "Search the product catalogue"}
          description={
            search
              ? "Try a simpler keyword (e.g. 'rice' instead of brand names) or clear the store filters."
              : "Find any grocery item and compare its price, per-kg cost and promos across stores."
          }
        />
      ) : (
        <>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead className="hidden sm:table-cell">Pack</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Per kg</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p) => (
                  <TableRow
                    key={p.id}
                    onClick={() => router.push(`/products/${p.id}`)}
                    className="cursor-pointer"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") router.push(`/products/${p.id}`);
                    }}
                  >
                    <TableCell className="max-w-[280px]">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {p.brand ?? "No brand"}
                        {p.isOrganic ? " · Organic" : ""}
                        {p.isHalal ? " · Halal" : ""}
                      </p>
                    </TableCell>
                    <TableCell>
                      {p.store ? <StoreBadge code={p.store.code} /> : null}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                      {p.unitCount > 1 ? `${p.unitCount} × ` : ""}
                      {p.packSize}
                      {p.packUnit.toLowerCase()}
                    </TableCell>
                    <TableCell className="text-right">
                      {p.currentPrice ? (
                        <div className="flex flex-col items-end">
                          <span className="text-sm font-semibold">
                            {formatSGD(p.currentPrice.priceCents)}
                          </span>
                          {p.currentPrice.isPromo && (
                            <Badge variant="success" className="mt-0.5">
                              Promo
                              {p.currentPrice.wasPriceCents
                                ? ` · was ${formatSGD(p.currentPrice.wasPriceCents)}`
                                : ""}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No price</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-right text-sm text-muted-foreground md:table-cell">
                      {formatPerKg(p.currentPrice?.pricePerKgCents) ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
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
