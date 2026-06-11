import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  hint?: string;
  loading?: boolean;
  tone?: "default" | "positive" | "warning";
  className?: string;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  loading,
  tone = "default",
  className,
}: StatCardProps) {
  return (
    <Card className={cn(className)}>
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0 space-y-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="h-7 w-24" />
          ) : (
            <p
              className={cn(
                "truncate text-2xl font-semibold tracking-tight",
                tone === "positive" && "text-emerald-600 dark:text-emerald-400",
                tone === "warning" && "text-amber-600 dark:text-amber-400",
              )}
            >
              {value}
            </p>
          )}
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-4.5 w-4.5 text-primary" aria-hidden />
        </div>
      </CardContent>
    </Card>
  );
}
