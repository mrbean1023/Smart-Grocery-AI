import type { JobsOptions } from 'bullmq';

export const RECIPE_PROCESSING_QUEUE = 'recipe-processing';
export const RECIPE_PROCESSING_JOB = 'process-recipe';

export interface RecipeProcessingJobData {
  recipeId: string;
  /** Storage key of an uploaded image/PDF (mutually exclusive with url/rawText). */
  fileKey?: string;
  mime?: string;
  /** Public recipe URL to import. */
  url?: string;
  /** Pasted raw text. */
  rawText?: string;
}

export const RECIPE_PROCESSING_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: 100,
  removeOnFail: 500,
};
