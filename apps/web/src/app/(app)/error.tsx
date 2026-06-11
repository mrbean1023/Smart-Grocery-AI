"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="py-10">
      <EmptyState
        icon={AlertTriangle}
        title="Something went wrong"
        description={
          error.message || "An unexpected error occurred while loading this page. Please try again."
        }
        action={
          <Button onClick={reset}>
            <RotateCcw aria-hidden /> Try again
          </Button>
        }
      />
    </div>
  );
}
