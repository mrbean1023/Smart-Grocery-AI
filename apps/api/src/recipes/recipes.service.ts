import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import type { Prisma } from '@prisma/client';
import type { ManualRecipeInput, Paginated, RecipeDto } from '@smart-grocery/shared';
import { PrismaService } from '../prisma/prisma.service';
import { QuotaService } from '../billing/quota.service';
import type { AuthUser } from '../auth/types';
import { StorageService } from '../storage/storage.service';
import { NormalizationService } from '../ingredients/normalization.service';
import { IngredientsService } from '../ingredients/ingredients.service';
import { NutritionService } from '../nutrition/nutrition.service';
import { RecipeMapper, type RecipeWithRelations } from './recipe.mapper';
import {
  RECIPE_PROCESSING_JOB,
  RECIPE_PROCESSING_JOB_OPTIONS,
  RECIPE_PROCESSING_QUEUE,
  type RecipeProcessingJobData,
} from './recipe-processing.types';

export interface ListRecipesQuery {
  page: number;
  pageSize: number;
  search?: string;
}

export interface UpdateRecipeInput {
  title?: string;
  description?: string;
  servings?: number;
  prepMinutes?: number;
  cookMinutes?: number;
  cuisine?: string;
  tags?: string[];
  instructions?: string[];
  ingredients?: Array<{ rawText: string; optional?: boolean }>;
}

export interface IngredientLineInput {
  rawText: string;
  optional?: boolean;
}

const RECIPE_INCLUDE = {
  ingredients: { include: { ingredient: true } },
  nutrition: true,
} satisfies Prisma.RecipeInclude;

function inferMimeFromKey(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.heic')) return 'image/heic';
  return 'image/jpeg';
}

function titleFromFilename(filename: string): string {
  const stem = filename.replace(/\.[a-z0-9]+$/i, '').replace(/[._-]+/g, ' ').trim();
  return (stem || 'Uploaded recipe').slice(0, 200);
}

@Injectable()
export class RecipesService {
  private readonly logger = new Logger(RecipesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: QuotaService,
    private readonly storage: StorageService,
    private readonly normalization: NormalizationService,
    private readonly ingredientsService: IngredientsService,
    private readonly nutrition: NutritionService,
    private readonly mapper: RecipeMapper,
    @InjectQueue(RECIPE_PROCESSING_QUEUE) private readonly queue: Queue,
  ) {}

  // ------------------------------------------------------------------ reads

  async list(user: AuthUser, query: ListRecipesQuery): Promise<Paginated<RecipeDto>> {
    const where: Prisma.RecipeWhereInput = {
      deletedAt: null,
      OR: [{ userId: user.id }, { isPublic: true }],
    };
    if (query.search) {
      where.AND = [
        {
          OR: [
            { title: { contains: query.search, mode: 'insensitive' } },
            { tags: { hasSome: [query.search, query.search.toLowerCase()] } },
          ],
        },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.recipe.findMany({
        where,
        include: RECIPE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.recipe.count({ where }),
    ]);
    const items = await Promise.all(
      rows.map((row) => this.mapper.toDto(row as RecipeWithRelations)),
    );
    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async getById(user: AuthUser, id: string): Promise<RecipeDto> {
    const recipe = await this.prisma.recipe.findUnique({
      where: { id },
      include: RECIPE_INCLUDE,
    });
    if (!recipe || recipe.deletedAt || (recipe.userId !== user.id && !recipe.isPublic)) {
      throw new NotFoundException('Recipe not found');
    }
    return this.mapper.toDto(recipe as RecipeWithRelations);
  }

  // ----------------------------------------------------------------- writes

  /** Manual recipe: synchronous parse → match → canonical qty → nutrition. */
  async createManual(user: AuthUser, input: ManualRecipeInput): Promise<RecipeDto> {
    const recipe = await this.prisma.recipe.create({
      data: {
        userId: user.id,
        title: input.title,
        description: input.description ?? null,
        servings: input.servings,
        prepMinutes: input.prepMinutes ?? null,
        cookMinutes: input.cookMinutes ?? null,
        cuisine: input.cuisine ?? null,
        tags: input.tags,
        instructions: input.instructions,
        source: 'MANUAL',
        status: 'PROCESSING',
      },
    });
    await this.attachIngredients(recipe.id, input.ingredients);
    await this.nutrition.computeRecipeNutrition(recipe.id);
    await this.prisma.recipe.update({
      where: { id: recipe.id },
      data: { status: 'READY' },
    });
    return this.requireDto(recipe.id);
  }

  async upload(user: AuthUser, file: Express.Multer.File): Promise<RecipeDto> {
    await this.quota.assertAndConsume(user, 'RECIPE_SCAN');
    const key = this.storage.buildKey(user.id, 'recipes', file.originalname || 'upload');
    await this.storage.upload({ buffer: file.buffer, key, contentType: file.mimetype });
    const isPdf = file.mimetype === 'application/pdf';
    const recipe = await this.prisma.recipe.create({
      data: {
        userId: user.id,
        title: titleFromFilename(file.originalname || 'Uploaded recipe'),
        source: isPdf ? 'PDF_OCR' : 'IMAGE_OCR',
        status: 'PROCESSING',
        imageUrl: key, // storage key; presigned at read time
      },
    });
    await this.enqueue({ recipeId: recipe.id, fileKey: key, mime: file.mimetype });
    return this.requireDto(recipe.id);
  }

  async importUrl(user: AuthUser, url: string): Promise<RecipeDto> {
    await this.quota.assertAndConsume(user, 'RECIPE_SCAN');
    let hostname: string;
    try {
      hostname = new URL(url).hostname;
    } catch {
      throw new BadRequestException('Invalid URL');
    }
    const recipe = await this.prisma.recipe.create({
      data: {
        userId: user.id,
        title: `Import from ${hostname}`.slice(0, 200),
        source: 'URL_IMPORT',
        status: 'PROCESSING',
        sourceUrl: url,
      },
    });
    await this.enqueue({ recipeId: recipe.id, url });
    return this.requireDto(recipe.id);
  }

  async paste(user: AuthUser, text: string): Promise<RecipeDto> {
    await this.quota.assertAndConsume(user, 'RECIPE_SCAN');
    const recipe = await this.prisma.recipe.create({
      data: {
        userId: user.id,
        title: 'Pasted recipe',
        source: 'MANUAL',
        status: 'PROCESSING',
        rawText: text,
      },
    });
    await this.enqueue({ recipeId: recipe.id, rawText: text });
    return this.requireDto(recipe.id);
  }

  async update(user: AuthUser, id: string, input: UpdateRecipeInput): Promise<RecipeDto> {
    await this.requireOwned(user, id);
    const data: Prisma.RecipeUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.servings !== undefined) data.servings = input.servings;
    if (input.prepMinutes !== undefined) data.prepMinutes = input.prepMinutes;
    if (input.cookMinutes !== undefined) data.cookMinutes = input.cookMinutes;
    if (input.cuisine !== undefined) data.cuisine = input.cuisine;
    if (input.tags !== undefined) data.tags = input.tags;
    if (input.instructions !== undefined) data.instructions = input.instructions;
    if (Object.keys(data).length > 0) {
      await this.prisma.recipe.update({ where: { id }, data });
    }
    if (input.ingredients !== undefined) {
      // replace ingredient lines and re-run matching + nutrition synchronously
      await this.prisma.recipeIngredient.deleteMany({ where: { recipeId: id } });
      await this.attachIngredients(id, input.ingredients);
      await this.nutrition.computeRecipeNutrition(id);
      await this.prisma.recipe.update({
        where: { id },
        data: { status: 'READY', failureReason: null },
      });
    } else if (input.servings !== undefined) {
      // serving count changes the per-serving nutrition
      await this.nutrition.computeRecipeNutrition(id);
    }
    return this.requireDto(id);
  }

  async softDelete(user: AuthUser, id: string): Promise<void> {
    await this.requireOwned(user, id);
    await this.prisma.recipe.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async reprocess(user: AuthUser, id: string): Promise<RecipeDto> {
    const recipe = await this.requireOwned(user, id);
    let jobData: RecipeProcessingJobData;
    if (recipe.source === 'URL_IMPORT' && recipe.sourceUrl) {
      jobData = { recipeId: id, url: recipe.sourceUrl };
    } else if (
      (recipe.source === 'IMAGE_OCR' || recipe.source === 'PDF_OCR') &&
      recipe.imageUrl &&
      !/^https?:\/\//i.test(recipe.imageUrl)
    ) {
      jobData = {
        recipeId: id,
        fileKey: recipe.imageUrl,
        mime: recipe.source === 'PDF_OCR' ? 'application/pdf' : inferMimeFromKey(recipe.imageUrl),
      };
    } else if (recipe.rawText) {
      jobData = { recipeId: id, rawText: recipe.rawText };
    } else {
      throw new UnprocessableEntityException(
        'This recipe has no stored source (file, URL or raw text) to reprocess',
      );
    }
    await this.prisma.recipe.update({
      where: { id },
      data: { status: 'PROCESSING', failureReason: null },
    });
    await this.enqueue(jobData);
    return this.requireDto(id);
  }

  // ------------------------------------------------------------- pipeline

  /**
   * Parse, match and persist ingredient lines for a recipe.
   * Shared by the synchronous manual flow and the async processor.
   */
  async attachIngredients(recipeId: string, lines: IngredientLineInput[]): Promise<void> {
    let sortOrder = 0;
    for (const line of lines) {
      const rawText = line.rawText.trim().slice(0, 300);
      if (!rawText) continue;
      const parsed = this.normalization.normalizeLine(rawText);
      const match = await this.ingredientsService.findOrMatch(parsed.name);
      let conversion: { density: number | null; gramsPerPiece: number | null } | null = null;
      if (match.ingredientId) {
        conversion = await this.prisma.ingredient.findUnique({
          where: { id: match.ingredientId },
          select: { density: true, gramsPerPiece: true },
        });
      }
      const normalizedQtyG = this.ingredientsService.toCanonicalQty(parsed, conversion);
      await this.prisma.recipeIngredient.create({
        data: {
          recipeId,
          ingredientId: match.ingredientId,
          rawText,
          quantity: parsed.quantity,
          unit: parsed.unit,
          normalizedQtyG,
          optional: line.optional === true || parsed.optional,
          matchConfidence: match.ingredientId ? match.confidence : null,
          sortOrder: sortOrder++,
        },
      });
    }
  }

  // -------------------------------------------------------------- helpers

  private async enqueue(data: RecipeProcessingJobData): Promise<void> {
    await this.queue.add(RECIPE_PROCESSING_JOB, data, RECIPE_PROCESSING_JOB_OPTIONS);
    this.logger.log(`Enqueued recipe-processing job for recipe ${data.recipeId}`);
  }

  private async requireOwned(user: AuthUser, id: string) {
    const recipe = await this.prisma.recipe.findUnique({ where: { id } });
    if (!recipe || recipe.deletedAt || recipe.userId !== user.id) {
      throw new NotFoundException('Recipe not found');
    }
    return recipe;
  }

  private async requireDto(id: string): Promise<RecipeDto> {
    const recipe = await this.prisma.recipe.findUnique({
      where: { id },
      include: RECIPE_INCLUDE,
    });
    if (!recipe) throw new NotFoundException('Recipe not found');
    return this.mapper.toDto(recipe as RecipeWithRelations);
  }
}
