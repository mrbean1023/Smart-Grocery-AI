import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useUpgradePrompt } from "@/stores/upgrade-store";

/** True for 402 responses (QUOTA_EXCEEDED / PREMIUM_REQUIRED). */
export function isUpgradeError(e: unknown): e is ApiError {
  return e instanceof ApiError && e.status === 402;
}

export function getErrorMessage(e: unknown, fallback = "Something went wrong"): string {
  if (e instanceof ApiError) return e.message || fallback;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

/**
 * Standard mutation/query error handler:
 * 402 → open the centralised upgrade dialog; anything else → error toast.
 */
export function handleApiError(e: unknown, fallback = "Something went wrong") {
  if (isUpgradeError(e)) {
    useUpgradePrompt
      .getState()
      .show(
        e.code === "QUOTA_EXCEEDED"
          ? "You've hit your free plan limit. Upgrade to Premium for unlimited access."
          : e.message || "This feature is part of Premium.",
      );
    return;
  }
  toast.error(getErrorMessage(e, fallback));
}
