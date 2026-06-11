import { z } from 'zod';
import { upsertAlertSchema } from '@smart-grocery/shared';

export const createPriceWatchSchema = z.object({
  productId: z.string().uuid(),
  targetPriceCents: z.number().int().min(1).max(1_000_000).optional(),
});

export type CreatePriceWatchInput = z.infer<typeof createPriceWatchSchema>;

// Re-export the shared upsert schema (and its inferred type) for the controller.
export { upsertAlertSchema };
export type UpsertAlertInput = z.infer<typeof upsertAlertSchema>;
