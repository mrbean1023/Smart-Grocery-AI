import type { BasketStrategy } from "@smart-grocery/shared";

export const STRATEGY_META: Record<
  BasketStrategy,
  { label: string; emoji: string; description: string }
> = {
  CHEAPEST: {
    label: "Cheapest",
    emoji: "\u{1F4B0}",
    description: "Lowest grand total across every store, even if it means a few trips.",
  },
  CONVENIENCE: {
    label: "Fewest stores",
    emoji: "\u{1F3EA}",
    description: "Everything from as few stores as possible — one trip, done.",
  },
  DELIVERY: {
    label: "Best delivery",
    emoji: "\u{1F69A}",
    description: "Optimised for delivery fees and free-delivery thresholds.",
  },
  QUALITY: {
    label: "Best quality",
    emoji: "⭐",
    description: "Prefers higher-rated stores and premium product tiers.",
  },
};

export const STRATEGIES = Object.keys(STRATEGY_META) as BasketStrategy[];
