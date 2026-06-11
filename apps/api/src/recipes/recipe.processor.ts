import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../metrics/metrics.service';
import { StorageService } from '../storage/storage.service';
import { OcrService } from '../ocr/ocr.service';
import { OpenAiService } from '../ai/openai.service';
import { NutritionService } from '../nutrition/nutrition.service';
import { RecipesService } from './recipes.service';
import {
  RECIPE_PROCESSING_QUEUE,
  type RecipeProcessingJobData,
} from './recipe-processing.types';
import {
  aiStructuredRecipeSchema,
  extractRecipeJsonLd,
  extractVisibleText,
  structuredRecipeToRawText,
  type StructuredRecipe,
} from './recipe-extraction';

const FETCH_TIMEOUT_MS = 10_000;
const FETCH_MAX_BYTES = 2 * 1024 * 1024;
const USER_AGENT = 'SmartGroceryBot/1.0';
const AI_INPUT_CHAR_LIMIT = 12_000;
const FAILURE_REASON_MAX = 480;

const AI_SYSTEM_PROMPT =
  'You are a recipe extraction engine. Extract structured recipe data from raw text. ' +
  'Respond with a single JSON object with exactly these keys: ' +
  '{"title": string, "description": string|null, "servings": integer, ' +
  '"prepMinutes": integer|null, "cookMinutes": integer|null, "cuisine": string|null, ' +
  '"tags": string[], "instructions": string[], ' +
  '"ingredients": [{"rawText": string, "optional": boolean}]}. ' +
  'Each ingredients[].rawText must be one ingredient line exactly as written in the source ' +
  '(e.g. "2 tbsp light soy sauce"). Use null when a value is unknown. ' +
  'Never invent ingredients or steps that are not in the text.';

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

@Processor(RECIPE_PROCESSING_QUEUE, { concurrency: 2 })
export class RecipeProcessor extends WorkerHost {
  private readonly logger = new Logger(RecipeProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ocr: OcrService,
    private readonly openAi: OpenAiService,
    private readonly recipesService: RecipesService,
    private readonly nutrition: NutritionService,
    private readonly metrics: MetricsService,
  ) {
    super();
  }

  async process(job: Job<RecipeProcessingJobData>): Promise<void> {
    const started = Date.now();
    try {
      await this.run(job.data);
      this.metrics.increment('recipe_processing_total', { outcome: 'success' });
    } catch (err) {
      const maxAttempts = typeof job.opts.attempts === 'number' ? job.opts.attempts : 1;
      const isFinal = err instanceof UnrecoverableError || job.attemptsMade + 1 >= maxAttempts;
      if (isFinal) {
        this.metrics.increment('recipe_processing_total', { outcome: 'failed' });
        await this.markFailed(job.data.recipeId, errorMessage(err));
      } else {
        this.metrics.increment('recipe_processing_total', { outcome: 'retry' });
        this.logger.warn(
          `Recipe ${job.data.recipeId} attempt ${job.attemptsMade + 1}/${maxAttempts} failed: ${errorMessage(err)}`,
        );
      }
      throw err instanceof Error ? err : new Error(String(err));
    } finally {
      this.metrics.observeHistogram('recipe_processing_duration_ms', Date.now() - started);
    }
  }

  private async run(data: RecipeProcessingJobData): Promise<void> {
    const recipe = await this.prisma.recipe.findUnique({ where: { id: data.recipeId } });
    if (!recipe || recipe.deletedAt) {
      this.logger.warn(`Recipe ${data.recipeId} missing or deleted — skipping job`);
      return;
    }

    // (a) obtain raw text -------------------------------------------------
    let rawText: string;
    let jsonLd: StructuredRecipe | null = null;
    if (data.fileKey) {
      const buffer = await this.storage.getObject(data.fileKey);
      rawText =
        data.mime === 'application/pdf'
          ? await this.ocr.extractTextFromPdf(buffer)
          : await this.ocr.extractTextFromImage(buffer, data.mime ?? 'image/jpeg');
    } else if (data.url) {
      const html = await this.fetchHtml(data.url);
      jsonLd = extractRecipeJsonLd(html);
      rawText = jsonLd ? structuredRecipeToRawText(jsonLd) : extractVisibleText(html);
      if (!rawText.trim()) {
        throw new UnrecoverableError('The page contained no readable recipe text');
      }
    } else if (data.rawText) {
      rawText = data.rawText;
    } else {
      throw new UnrecoverableError('Job carries no fileKey, url or rawText');
    }

    // (b) structure --------------------------------------------------------
    let structured: StructuredRecipe;
    if (jsonLd && jsonLd.title && jsonLd.ingredients.length > 0) {
      structured = jsonLd; // deterministic schema.org data beats an LLM pass
    } else if (this.openAi.isConfigured()) {
      structured = await this.structureWithAi(rawText);
      if (jsonLd?.imageUrl && !structured.imageUrl) {
        structured.imageUrl = jsonLd.imageUrl;
      }
    } else if (jsonLd) {
      structured = jsonLd; // partial JSON-LD is still better than nothing
    } else {
      throw new UnrecoverableError('AI extraction unavailable');
    }
    if (structured.ingredients.length === 0) {
      throw new UnrecoverableError('No ingredients could be extracted from the source');
    }

    await this.prisma.recipe.update({
      where: { id: recipe.id },
      data: {
        title: structured.title || recipe.title,
        description: structured.description ?? recipe.description,
        servings: structured.servings > 0 ? structured.servings : recipe.servings,
        prepMinutes: structured.prepMinutes,
        cookMinutes: structured.cookMinutes,
        cuisine: structured.cuisine,
        tags: structured.tags,
        instructions: structured.instructions,
        rawText: truncate(rawText, 50_000),
        // never overwrite an uploaded file key; adopt JSON-LD image otherwise
        imageUrl: recipe.imageUrl ?? structured.imageUrl ?? null,
      },
    });

    // (c) ingredient matching ---------------------------------------------
    await this.prisma.recipeIngredient.deleteMany({ where: { recipeId: recipe.id } });
    await this.recipesService.attachIngredients(recipe.id, structured.ingredients);

    // (d) nutrition ---------------------------------------------------------
    await this.nutrition.computeRecipeNutrition(recipe.id);

    // (e) ready --------------------------------------------------------------
    await this.prisma.recipe.update({
      where: { id: recipe.id },
      data: { status: 'READY', failureReason: null },
    });
    this.logger.log(`Recipe ${recipe.id} processed → READY`);
  }

  private async fetchHtml(url: string): Promise<string> {
    const response = await axios.get<string>(url, {
      timeout: FETCH_TIMEOUT_MS,
      responseType: 'text',
      maxContentLength: FETCH_MAX_BYTES,
      maxBodyLength: FETCH_MAX_BYTES,
      maxRedirects: 3,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (typeof response.data !== 'string' || !response.data) {
      throw new Error(`Empty response from ${url}`);
    }
    return response.data;
  }

  private async structureWithAi(rawText: string): Promise<StructuredRecipe> {
    const raw = await this.openAi.chatJson<unknown>({
      system: AI_SYSTEM_PROMPT,
      user: `Extract the recipe from this text:\n\n${truncate(rawText, AI_INPUT_CHAR_LIMIT)}`,
      maxTokens: 3000,
    });
    const parsed = aiStructuredRecipeSchema.safeParse(raw);
    if (!parsed.success) {
      throw new UnrecoverableError(
        `AI extraction returned an unusable structure: ${parsed.error.issues[0]?.message ?? 'unknown'}`,
      );
    }
    return { ...parsed.data, imageUrl: null };
  }

  private async markFailed(recipeId: string, reason: string): Promise<void> {
    try {
      await this.prisma.recipe.update({
        where: { id: recipeId },
        data: { status: 'FAILED', failureReason: truncate(reason, FAILURE_REASON_MAX) },
      });
    } catch (err) {
      this.logger.error(`Could not mark recipe ${recipeId} as FAILED: ${errorMessage(err)}`);
    }
  }
}
