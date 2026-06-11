jest.mock('axios');

import axios from 'axios';
import { UnrecoverableError, type Job } from 'bullmq';
import { RecipeProcessor } from './recipe.processor';
import type { RecipeProcessingJobData } from './recipe-processing.types';
import type { PrismaService } from '../prisma/prisma.service';
import type { MetricsService } from '../metrics/metrics.service';
import type { StorageService } from '../storage/storage.service';
import type { OcrService } from '../ocr/ocr.service';
import type { OpenAiService } from '../ai/openai.service';
import type { NutritionService } from '../nutrition/nutrition.service';
import type { RecipesService } from './recipes.service';

const mockedAxiosGet = axios.get as jest.Mock;

interface Mocks {
  prisma: {
    recipe: { findUnique: jest.Mock; update: jest.Mock };
    recipeIngredient: { deleteMany: jest.Mock };
  };
  storage: { getObject: jest.Mock };
  ocr: { extractTextFromImage: jest.Mock; extractTextFromPdf: jest.Mock };
  openAi: { isConfigured: jest.Mock; chatJson: jest.Mock };
  recipesService: { attachIngredients: jest.Mock };
  nutrition: { computeRecipeNutrition: jest.Mock };
  metrics: { increment: jest.Mock; observeHistogram: jest.Mock };
}

function buildMocks(): Mocks {
  return {
    prisma: {
      recipe: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'recipe-1',
          deletedAt: null,
          title: 'Pasted recipe',
          description: null,
          servings: 2,
          imageUrl: null,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      recipeIngredient: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    },
    storage: { getObject: jest.fn() },
    ocr: { extractTextFromImage: jest.fn(), extractTextFromPdf: jest.fn() },
    openAi: { isConfigured: jest.fn().mockReturnValue(true), chatJson: jest.fn() },
    recipesService: { attachIngredients: jest.fn().mockResolvedValue(undefined) },
    nutrition: { computeRecipeNutrition: jest.fn().mockResolvedValue(undefined) },
    metrics: { increment: jest.fn(), observeHistogram: jest.fn() },
  };
}

function buildProcessor(mocks: Mocks): RecipeProcessor {
  return new RecipeProcessor(
    mocks.prisma as unknown as PrismaService,
    mocks.storage as unknown as StorageService,
    mocks.ocr as unknown as OcrService,
    mocks.openAi as unknown as OpenAiService,
    mocks.recipesService as unknown as RecipesService,
    mocks.nutrition as unknown as NutritionService,
    mocks.metrics as unknown as MetricsService,
  );
}

function buildJob(data: RecipeProcessingJobData, attemptsMade = 0): Job<RecipeProcessingJobData> {
  return {
    data,
    attemptsMade,
    opts: { attempts: 3 },
  } as unknown as Job<RecipeProcessingJobData>;
}

const AI_STRUCTURED = {
  title: 'Garlic Fried Rice',
  description: 'Quick weeknight dish',
  servings: 2,
  prepMinutes: 10,
  cookMinutes: 10,
  cuisine: 'Chinese',
  tags: ['rice', 'quick'],
  instructions: ['Fry garlic', 'Add rice and soy sauce'],
  ingredients: [
    { rawText: '2 cups cooked jasmine rice', optional: false },
    { rawText: '3 cloves garlic, minced', optional: false },
    { rawText: '1 tbsp light soy sauce', optional: false },
  ],
};

const JSON_LD_HTML = `
<html><head><script type="application/ld+json">
{
  "@type": "Recipe",
  "name": "Kaya Toast",
  "recipeYield": "2 servings",
  "recipeIngredient": ["4 slices bread", "2 tbsp kaya"],
  "recipeInstructions": [{ "@type": "HowToStep", "text": "Toast and spread." }]
}
</script></head><body></body></html>`;

describe('RecipeProcessor', () => {
  beforeEach(() => {
    mockedAxiosGet.mockReset();
  });

  it('processes a pasted recipe end-to-end via AI structuring (happy path)', async () => {
    const mocks = buildMocks();
    mocks.openAi.chatJson.mockResolvedValue(AI_STRUCTURED);
    const processor = buildProcessor(mocks);

    await processor.process(buildJob({ recipeId: 'recipe-1', rawText: 'garlic fried rice ...' }));

    // AI structuring used the pasted text
    expect(mocks.openAi.chatJson).toHaveBeenCalledTimes(1);

    // recipe fields persisted from the structured result
    const firstUpdate = mocks.prisma.recipe.update.mock.calls[0][0];
    expect(firstUpdate.where).toEqual({ id: 'recipe-1' });
    expect(firstUpdate.data.title).toBe('Garlic Fried Rice');
    expect(firstUpdate.data.servings).toBe(2);
    expect(firstUpdate.data.instructions).toEqual(['Fry garlic', 'Add rice and soy sauce']);
    expect(firstUpdate.data.rawText).toBe('garlic fried rice ...');

    // old lines replaced, new lines attached, nutrition recomputed
    expect(mocks.prisma.recipeIngredient.deleteMany).toHaveBeenCalledWith({
      where: { recipeId: 'recipe-1' },
    });
    expect(mocks.recipesService.attachIngredients).toHaveBeenCalledWith(
      'recipe-1',
      AI_STRUCTURED.ingredients,
    );
    expect(mocks.nutrition.computeRecipeNutrition).toHaveBeenCalledWith('recipe-1');

    // final status flip
    const lastUpdate = mocks.prisma.recipe.update.mock.calls.at(-1)![0];
    expect(lastUpdate.data.status).toBe('READY');

    expect(mocks.metrics.increment).toHaveBeenCalledWith('recipe_processing_total', {
      outcome: 'success',
    });
    expect(mocks.metrics.observeHistogram).toHaveBeenCalledWith(
      'recipe_processing_duration_ms',
      expect.any(Number),
    );
  });

  it('uses JSON-LD directly for URL imports without calling the AI', async () => {
    const mocks = buildMocks();
    mockedAxiosGet.mockResolvedValue({ data: JSON_LD_HTML });
    const processor = buildProcessor(mocks);

    await processor.process(
      buildJob({ recipeId: 'recipe-1', url: 'https://blog.example.sg/kaya-toast' }),
    );

    expect(mockedAxiosGet).toHaveBeenCalledWith(
      'https://blog.example.sg/kaya-toast',
      expect.objectContaining({
        timeout: 10_000,
        headers: expect.objectContaining({ 'User-Agent': 'SmartGroceryBot/1.0' }),
      }),
    );
    expect(mocks.openAi.chatJson).not.toHaveBeenCalled();

    const firstUpdate = mocks.prisma.recipe.update.mock.calls[0][0];
    expect(firstUpdate.data.title).toBe('Kaya Toast');
    expect(mocks.recipesService.attachIngredients).toHaveBeenCalledWith('recipe-1', [
      { rawText: '4 slices bread', optional: false },
      { rawText: '2 tbsp kaya', optional: false },
    ]);
    const lastUpdate = mocks.prisma.recipe.update.mock.calls.at(-1)![0];
    expect(lastUpdate.data.status).toBe('READY');
  });

  it('marks the recipe FAILED when AI is unconfigured and no JSON-LD exists', async () => {
    const mocks = buildMocks();
    mocks.openAi.isConfigured.mockReturnValue(false);
    const processor = buildProcessor(mocks);

    await expect(
      processor.process(buildJob({ recipeId: 'recipe-1', rawText: 'some pasted text' })),
    ).rejects.toBeInstanceOf(UnrecoverableError);

    const failUpdate = mocks.prisma.recipe.update.mock.calls.at(-1)![0];
    expect(failUpdate.data.status).toBe('FAILED');
    expect(failUpdate.data.failureReason).toBe('AI extraction unavailable');
    expect(mocks.metrics.increment).toHaveBeenCalledWith('recipe_processing_total', {
      outcome: 'failed',
    });
  });

  it('does not mark FAILED on a retryable mid-pipeline error before the final attempt', async () => {
    const mocks = buildMocks();
    mocks.openAi.chatJson.mockRejectedValue(new Error('upstream 500'));
    const processor = buildProcessor(mocks);

    await expect(
      processor.process(buildJob({ recipeId: 'recipe-1', rawText: 'text' }, 0)),
    ).rejects.toThrow('upstream 500');

    expect(mocks.metrics.increment).toHaveBeenCalledWith('recipe_processing_total', {
      outcome: 'retry',
    });
    // no FAILED status write
    const failedWrites = mocks.prisma.recipe.update.mock.calls.filter(
      (call) => call[0].data?.status === 'FAILED',
    );
    expect(failedWrites).toHaveLength(0);
  });

  it('marks FAILED with a truncated reason on the final attempt', async () => {
    const mocks = buildMocks();
    mocks.openAi.chatJson.mockRejectedValue(new Error('x'.repeat(600)));
    const processor = buildProcessor(mocks);

    await expect(
      processor.process(buildJob({ recipeId: 'recipe-1', rawText: 'text' }, 2)),
    ).rejects.toThrow();

    const failUpdate = mocks.prisma.recipe.update.mock.calls.at(-1)![0];
    expect(failUpdate.data.status).toBe('FAILED');
    expect(failUpdate.data.failureReason.length).toBeLessThanOrEqual(480);
  });
});
