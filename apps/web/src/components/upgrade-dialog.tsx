"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, Crown, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { formatSGD } from "@/lib/format";
import { useUpgradePrompt } from "@/stores/upgrade-store";
import { PREMIUM_PRICE } from "@smart-grocery/shared";

const BENEFITS = [
  "Unlimited recipe scans and basket optimizations",
  "AI weekly meal planning within your budget",
  "Price forecasts — buy before prices rise",
  "Price drop, promo and budget alerts",
  "Unlimited pantry items and AI assistant chats",
];

export function UpgradeDialog() {
  const { open, message, close } = useUpgradePrompt();

  const checkout = useMutation({
    mutationFn: (plan: "monthly" | "yearly") =>
      api<{ url: string }>("/billing/checkout", { method: "POST", body: { plan } }),
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (e) => toast.error(getErrorMessage(e, "Could not start checkout")),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/50">
            <Crown className="h-6 w-6 text-amber-600 dark:text-amber-400" aria-hidden />
          </div>
          <DialogTitle className="text-center">Upgrade to Premium</DialogTitle>
          <DialogDescription className="text-center">
            {message ?? "Unlock everything Smart Grocery AI has to offer."}
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2.5">
          {BENEFITS.map((b) => (
            <li key={b} className="flex items-start gap-2 text-sm">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span>{b}</span>
            </li>
          ))}
        </ul>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            variant="outline"
            disabled={checkout.isPending}
            onClick={() => checkout.mutate("monthly")}
            className="h-auto flex-col py-3"
          >
            {checkout.isPending && checkout.variables === "monthly" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <span className="text-base font-semibold">
                  {formatSGD(PREMIUM_PRICE.monthlyCentsSGD)}/mo
                </span>
                <span className="text-xs text-muted-foreground">Billed monthly</span>
              </>
            )}
          </Button>
          <Button
            disabled={checkout.isPending}
            onClick={() => checkout.mutate("yearly")}
            className="h-auto flex-col py-3"
          >
            {checkout.isPending && checkout.variables === "yearly" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <span className="text-base font-semibold">
                  {formatSGD(PREMIUM_PRICE.yearlyCentsSGD)}/yr
                </span>
                <span className="text-xs opacity-90">2 months free</span>
              </>
            )}
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Cancel anytime from Settings → Billing.
        </p>
      </DialogContent>
    </Dialog>
  );
}
