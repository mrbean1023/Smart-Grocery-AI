import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PantryItem, PantryLocation, Prisma } from '@prisma/client';
import type {
  CreatePantryItemInput,
  PantryItemDto,
  IngredientCategory,
} from '@smart-grocery/shared';
import { updatePantryItemSchema } from '@smart-grocery/shared';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { QuotaService } from '../billing/quota.service';
import { OpenAiService } from '../ai/openai.service';
import { StorageService } from '../storage/storage.service';
import { AuthUser } from '../auth/types';
import { computeCoverageGrams, daysUntilExpiry } from './pantry.util';

export type UpdatePantryItemInput = z.infer<typeof updatePantryItemSchema>;

type PantryItemWithIngredient = PantryItem & {
  ingredient: { id: string; displayName: string; category: string } | null;
};

interface ScanItem {
  name: string;
  quantity?: number;
  unit?: string;
  location_guess?: string;
}

const MAX_SCAN_IMAGE_BYTES = 15 * 1024 * 1024;
const TRIGRAM_THRESHOLD = 0.35;

const PANTRY_LOCATIONS: ReadonlySet<string> = new Set(['PANTRY', 'FRIDGE', 'FREEZER']);

const INGREDIENT_SELECT = {
  select: { id: true, displayName: true, category: true },
} as const;

@Injectable()
export class PantryService {
  private readonly logger = new Logger(PantryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: QuotaService,
    private readonly openAi: OpenAiService,
    private readonly storage: StorageService,
  ) {}

  // ------------------------------------------------------------------
  // CRUD
  // ------------------------------------------------------------------

  async list(userId: string): Promise<PantryItemDto[]> {
    const items = (await this.prisma.pantryItem.findMany({
      where: { userId, consumedAt: null, wasted: false },
      include: { ingredient: INGREDIENT_SELECT },
      orderBy: [{ expiresAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
    })) as PantryItemWithIngredient[];
    return items.map((i) => this.toDto(i));
  }

  async getExpiring(userId: string, days: number): Promise<PantryItemDto[]> {
    const now = new Date();
    const boundary = new Date(now.getTime() + days * 86_400_000);
    const items = (await this.prisma.pantryItem.findMany({
      where: {
        userId,
        consumedAt: null,
        wasted: false,
        expiresAt: { not: null, lte: boundary },
      },
      include: { ingredient: INGREDIENT_SELECT },
      orderBy: { expiresAt: 'asc' },
    })) as PantryItemWithIngredient[];
    return items.map((i) => this.toDto(i));
  }

  async create(
    userId: string,
    input: CreatePantryItemInput,
    source: 'manual' | 'receipt' | 'scan' = 'manual',
  ): Promise<PantryItemDto> {
    const ingredientId = await this.matchIngredientId(input.name);
    const created = (await this.prisma.pantryItem.create({
      data: {
        userId,
        ingredientId,
        name: input.name,
        quantity: input.quantity,
        unit: input.unit,
        location: input.location as PantryLocation,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        purchasedAt: input.purchasedAt ? new Date(input.purchasedAt) : null,
        pricePaidCents: input.pricePaidCents ?? null,
        source,
      },
      include: { ingredient: INGREDIENT_SELECT },
    })) as PantryItemWithIngredient;
    return this.toDto(created);
  }

  async update(userId: string, id: string, input: UpdatePantryItemInput): Promise<PantryItemDto> {
    const existing = await this.prisma.pantryItem.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException('Pantry item not found');

    const data: Prisma.PantryItemUpdateInput = {};
    const logs: Array<{ action: string; quantityDelta: number; note?: string }> = [];

    if (input.name !== undefined && input.name !== existing.name) {
      data.name = input.name;
      const ingredientId = await this.matchIngredientId(input.name);
      data.ingredient = ingredientId
        ? { connect: { id: ingredientId } }
        : { disconnect: true };
    }
    if (input.unit !== undefined) data.unit = input.unit;
    if (input.location !== undefined) data.location = input.location as PantryLocation;
    if (input.expiresAt !== undefined) {
      data.expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    }
    if (input.purchasedAt !== undefined) {
      data.purchasedAt = input.purchasedAt ? new Date(input.purchasedAt) : null;
    }
    if (input.pricePaidCents !== undefined) data.pricePaidCents = input.pricePaidCents;

    if (input.quantity !== undefined && input.quantity !== existing.quantity) {
      data.quantity = input.quantity;
      logs.push({
        action: 'adjusted',
        quantityDelta: input.quantity - existing.quantity,
      });
    }

    if (input.wasted === true && !existing.wasted) {
      data.wasted = true;
      data.consumedAt = new Date();
      logs.push({ action: 'wasted', quantityDelta: -existing.quantity });
    } else if (input.consumed === true && !existing.consumedAt) {
      data.consumedAt = new Date();
      logs.push({ action: 'consumed', quantityDelta: -existing.quantity });
    }

    const updated = (await this.prisma.$transaction(async (tx) => {
      const row = await tx.pantryItem.update({
        where: { id },
        data,
        include: { ingredient: INGREDIENT_SELECT },
      });
      if (logs.length > 0) {
        await tx.pantryUsageLog.createMany({
          data: logs.map((l) => ({
            pantryItemId: id,
            action: l.action,
            quantityDelta: l.quantityDelta,
            note: l.note ?? null,
          })),
        });
      }
      return row;
    })) as PantryItemWithIngredient;

    return this.toDto(updated);
  }

  async remove(userId: string, id: string): Promise<{ deleted: true }> {
    const result = await this.prisma.pantryItem.deleteMany({ where: { id, userId } });
    if (result.count === 0) throw new NotFoundException('Pantry item not found');
    return { deleted: true };
  }

  // ------------------------------------------------------------------
  // Photo scan
  // ------------------------------------------------------------------

  async scanPhoto(
    user: AuthUser,
    file: Express.Multer.File | undefined,
    locationOverride?: string,
  ): Promise<PantryItemDto[]> {
    if (!file || !file.buffer) {
      throw new BadRequestException('An image file is required (multipart field "file")');
    }
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Only image uploads are supported');
    }
    if (file.size > MAX_SCAN_IMAGE_BYTES) {
      throw new PayloadTooLargeException('Image must be 15MB or smaller');
    }
    if (!this.openAi.isConfigured()) {
      throw new ServiceUnavailableException(
        'Pantry photo scanning is unavailable: OPENAI_API_KEY is not configured',
      );
    }

    await this.quota.assertAndConsume(user, 'OCR_UPLOAD');

    // Store the original photo for audit (best effort — scanning proceeds even if upload fails).
    const ext = (file.mimetype.split('/')[1] ?? 'jpg').replace(/[^a-z0-9]/gi, '') || 'jpg';
    const key = this.storage.buildKey(user.id, 'pantry-scans', `${Date.now()}.${ext}`);
    try {
      await this.storage.upload({ key, buffer: file.buffer, contentType: file.mimetype });
    } catch (err) {
      this.logger.warn(
        `Failed to archive pantry scan photo (${key}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const prompt =
      'Identify the grocery items visible in this pantry/fridge photo. ' +
      'Respond with ONLY a JSON object of the shape ' +
      '{"items":[{"name":string,"quantity":number,"unit":string,"location_guess":"PANTRY"|"FRIDGE"|"FREEZER"}]}. ' +
      'Use lowercase singular item names, metric units (g, ml, piece), and best-guess quantities.';

    const raw = await this.openAi.visionText({
      imageBase64: file.buffer.toString('base64'),
      mime: file.mimetype,
      prompt,
    });

    let items = this.parseScanItems(raw);
    if (!items) {
      const repaired = await this.openAi.chatJson<{ items: ScanItem[] }>({
        system:
          'You convert free text describing grocery items into strict JSON of shape ' +
          '{"items":[{"name":string,"quantity":number,"unit":string,"location_guess":string}]}. ' +
          'Output JSON only.',
        user: raw,
      });
      items = Array.isArray(repaired?.items) ? repaired.items : null;
    }

    const valid = (items ?? [])
      .filter((i): i is ScanItem => typeof i?.name === 'string' && i.name.trim().length > 0)
      .slice(0, 50);
    if (valid.length === 0) {
      throw new UnprocessableEntityException('No grocery items could be recognized in the photo');
    }

    const override =
      locationOverride && PANTRY_LOCATIONS.has(locationOverride.toUpperCase())
        ? (locationOverride.toUpperCase() as 'PANTRY' | 'FRIDGE' | 'FREEZER')
        : undefined;

    const created: PantryItemDto[] = [];
    for (const item of valid) {
      const guess =
        typeof item.location_guess === 'string' &&
        PANTRY_LOCATIONS.has(item.location_guess.toUpperCase())
          ? (item.location_guess.toUpperCase() as 'PANTRY' | 'FRIDGE' | 'FREEZER')
          : 'PANTRY';
      const quantity =
        typeof item.quantity === 'number' && isFinite(item.quantity) && item.quantity > 0
          ? Math.min(item.quantity, 100_000)
          : 1;
      const unit =
        typeof item.unit === 'string' && item.unit.trim().length > 0
          ? item.unit.trim().slice(0, 30)
          : 'piece';
      created.push(
        await this.create(
          user.id,
          {
            name: item.name.trim().slice(0, 200),
            quantity,
            unit,
            location: override ?? guess,
          },
          'scan',
        ),
      );
    }
    return created;
  }

  // ------------------------------------------------------------------
  // Helpers used by other modules
  // ------------------------------------------------------------------

  /** Unconsumed, non-wasted pantry items with ingredient links. */
  async getActiveItems(userId: string): Promise<PantryItemWithIngredient[]> {
    return (await this.prisma.pantryItem.findMany({
      where: { userId, consumedAt: null, wasted: false },
      include: { ingredient: INGREDIENT_SELECT },
    })) as PantryItemWithIngredient[];
  }

  /**
   * Grams available per ingredient for the given ingredient ids, converting
   * each pantry item to canonical mass via the shared unit engine.
   */
  async coverageForIngredients(
    userId: string,
    ingredientIds: string[],
  ): Promise<Map<string, number>> {
    if (ingredientIds.length === 0) return new Map();
    const items = await this.prisma.pantryItem.findMany({
      where: {
        userId,
        consumedAt: null,
        wasted: false,
        ingredientId: { in: ingredientIds },
      },
      select: {
        ingredientId: true,
        quantity: true,
        unit: true,
        ingredient: { select: { density: true, gramsPerPiece: true } },
      },
    });
    return computeCoverageGrams(items);
  }

  /**
   * Resolve a free-text item name to an ingredient id.
   * Order: exact canonical name → exact alias → trigram on names → trigram on aliases.
   */
  async matchIngredientId(name: string): Promise<string | null> {
    const q = name.trim().toLowerCase();
    if (!q) return null;

    const exact = await this.prisma.ingredient.findUnique({
      where: { name: q },
      select: { id: true },
    });
    if (exact) return exact.id;

    const alias = await this.prisma.ingredientAlias.findUnique({
      where: { alias: q },
      select: { ingredientId: true },
    });
    if (alias) return alias.ingredientId;

    const nameRows = await this.prisma.$queryRaw<Array<{ id: string; sim: number }>>`
      SELECT id, similarity(name, ${q})::float AS sim
      FROM ingredients
      WHERE similarity(name, ${q}) > ${TRIGRAM_THRESHOLD}
      ORDER BY sim DESC
      LIMIT 1`;

    const aliasRows = await this.prisma.$queryRaw<Array<{ id: string; sim: number }>>`
      SELECT "ingredientId" AS id, similarity(alias, ${q})::float AS sim
      FROM ingredient_aliases
      WHERE similarity(alias, ${q}) > ${TRIGRAM_THRESHOLD}
      ORDER BY sim DESC
      LIMIT 1`;

    const best = [...nameRows, ...aliasRows].sort((a, b) => b.sim - a.sim)[0];
    return best ? best.id : null;
  }

  /** Resolve an ingredient by name returning id + display name (used by assistant tools). */
  async matchIngredient(name: string): Promise<{ id: string; displayName: string } | null> {
    const id = await this.matchIngredientId(name);
    if (!id) return null;
    const ingredient = await this.prisma.ingredient.findUnique({
      where: { id },
      select: { id: true, displayName: true },
    });
    return ingredient;
  }

  // ------------------------------------------------------------------

  private toDto(item: PantryItemWithIngredient): PantryItemDto {
    return {
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      location: item.location,
      expiresAt: item.expiresAt ? item.expiresAt.toISOString() : null,
      purchasedAt: item.purchasedAt ? item.purchasedAt.toISOString() : null,
      daysUntilExpiry: daysUntilExpiry(item.expiresAt),
      ingredient: item.ingredient
        ? {
            id: item.ingredient.id,
            displayName: item.ingredient.displayName,
            category: item.ingredient.category as IngredientCategory,
          }
        : null,
    };
  }

  private parseScanItems(text: string): ScanItem[] | null {
    try {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return null;
      const parsed: unknown = JSON.parse(match[0]);
      if (
        parsed &&
        typeof parsed === 'object' &&
        Array.isArray((parsed as { items?: unknown }).items)
      ) {
        return (parsed as { items: ScanItem[] }).items;
      }
      return null;
    } catch {
      return null;
    }
  }
}
