import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ChatMessageDto, ChatMessageInput, ChatSessionDto } from '@smart-grocery/shared';
import { PrismaService } from '../prisma/prisma.service';
import { QuotaService } from '../billing/quota.service';
import { OpenAiService } from '../ai/openai.service';
import { AuthUser } from '../auth/types';
import { PantryService } from '../pantry/pantry.service';
import { estimateRecipeCost, fetchIngredientCosts } from '../recommendations/recipe-cost.util';
import { ASSISTANT_TOOLS } from './assistant.tools';

export interface ChatResponse {
  sessionId: string;
  reply: string;
  messages: ChatMessageDto[];
}

export interface SessionPreview {
  id: string;
  title: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  createdAt: string;
}

const CONTEXT_MESSAGES = 12;
const RETURNED_MESSAGES = 20;
const MAX_TOOL_ROUNDS = 6;

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: QuotaService,
    private readonly openAi: OpenAiService,
    private readonly pantry: PantryService,
  ) {}

  // ------------------------------------------------------------------
  // Chat
  // ------------------------------------------------------------------

  async chat(user: AuthUser, input: ChatMessageInput): Promise<ChatResponse> {
    if (!this.openAi.isConfigured()) {
      throw new ServiceUnavailableException('AI assistant requires OPENAI_API_KEY');
    }
    await this.quota.assertAndConsume(user, 'AI_CHAT_MESSAGE');

    const session = await this.findOrCreateSession(user.id, input.sessionId, input.message);

    await this.prisma.chatMessage.create({
      data: { sessionId: session.id, role: 'user', content: input.message },
    });

    const history = await this.prisma.chatMessage.findMany({
      where: { sessionId: session.id, role: { in: ['user', 'assistant'] } },
      orderBy: { createdAt: 'desc' },
      take: CONTEXT_MESSAGES,
    });
    const contextMessages = history
      .reverse()
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const profile = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { dietaryRestrictions: true, allergies: true, weeklyBudgetCents: true, householdSize: true },
    });

    const system =
      'You are SmartGrocer, a helpful grocery shopping assistant for Singapore. ' +
      'All prices are in SGD; tool results express prices in cents (e.g. 525 = S$5.25) — always present them as dollars. ' +
      `Today's date is ${new Date().toISOString().slice(0, 10)}. ` +
      `User dietary restrictions: ${profile?.dietaryRestrictions?.join(', ') || 'none'}. ` +
      `User allergies: ${profile?.allergies?.join(', ') || 'none'}. ` +
      `Household size: ${profile?.householdSize ?? 1}. ` +
      `Weekly grocery budget: ${
        profile?.weeklyBudgetCents != null
          ? `S$${(profile.weeklyBudgetCents / 100).toFixed(2)}`
          : 'not set'
      }. ` +
      'Use the available tools to ground answers in real data (products, prices, pantry, recipes, budget, substitutions). ' +
      'Be concise, practical and Singapore-specific (FairPrice, Sheng Siong, Giant, Cold Storage, Prime, RedMart, Amazon Fresh).';

    const reply = await this.openAi.toolLoop({
      system,
      messages: contextMessages,
      tools: ASSISTANT_TOOLS,
      executeTool: (name, args) => this.executeTool(user.id, name, args),
      maxRounds: MAX_TOOL_ROUNDS,
    });

    await this.prisma.chatMessage.create({
      data: { sessionId: session.id, role: 'assistant', content: reply },
    });
    await this.prisma.chatSession.update({
      where: { id: session.id },
      data: { updatedAt: new Date() },
    });

    const recent = await this.prisma.chatMessage.findMany({
      where: { sessionId: session.id, role: { in: ['user', 'assistant'] } },
      orderBy: { createdAt: 'desc' },
      take: RETURNED_MESSAGES,
    });

    return {
      sessionId: session.id,
      reply,
      messages: recent.reverse().map((m) => this.messageToDto(m)),
    };
  }

  // ------------------------------------------------------------------
  // Sessions
  // ------------------------------------------------------------------

  async listSessions(userId: string): Promise<SessionPreview[]> {
    const sessions = await this.prisma.chatSession.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { content: true, createdAt: true } },
      },
    });
    return sessions.map((s) => ({
      id: s.id,
      title: s.title,
      lastMessage: s.messages[0]?.content.slice(0, 140) ?? null,
      lastMessageAt: s.messages[0]?.createdAt.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
    }));
  }

  async getSession(userId: string, id: string): Promise<ChatSessionDto> {
    const session = await this.prisma.chatSession.findFirst({
      where: { id, userId },
      include: {
        messages: {
          where: { role: { in: ['user', 'assistant'] } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!session) throw new NotFoundException('Chat session not found');
    return {
      id: session.id,
      title: session.title,
      createdAt: session.createdAt.toISOString(),
      messages: session.messages.map((m) => this.messageToDto(m)),
    };
  }

  async deleteSession(userId: string, id: string): Promise<{ deleted: true }> {
    const result = await this.prisma.chatSession.deleteMany({ where: { id, userId } });
    if (result.count === 0) throw new NotFoundException('Chat session not found');
    return { deleted: true };
  }

  // ------------------------------------------------------------------
  // Tool executors — each returns a compact JSON string
  // ------------------------------------------------------------------

  private async executeTool(userId: string, name: string, args: unknown): Promise<string> {
    const a = (args ?? {}) as Record<string, unknown>;
    try {
      switch (name) {
        case 'search_products':
          return await this.toolSearchProducts(String(a.query ?? ''), this.optString(a.storeCode));
        case 'compare_ingredient_prices':
          return await this.toolCompareIngredientPrices(String(a.ingredient ?? ''));
        case 'get_pantry':
          return await this.toolGetPantry(userId);
        case 'get_recipes':
          return await this.toolGetRecipes(userId, this.optString(a.query), this.optNumber(a.maxCostCents));
        case 'get_budget_status':
          return await this.toolGetBudgetStatus(userId);
        case 'suggest_substitutions':
          return await this.toolSuggestSubstitutions(String(a.ingredient ?? ''));
        default:
          return JSON.stringify({ error: `Unknown tool: ${name}` });
      }
    } catch (err) {
      this.logger.warn(
        `Assistant tool ${name} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return JSON.stringify({ error: 'Tool execution failed' });
    }
  }

  private async toolSearchProducts(query: string, storeCode?: string): Promise<string> {
    if (!query.trim()) return JSON.stringify({ error: 'query is required' });
    const storeFilter = storeCode
      ? Prisma.sql`AND s.code = ${storeCode}::"StoreCode"`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; name: string; brand: string | null; packsize: number; packunit: string; store: string }>
    >(Prisma.sql`
      SELECT p.id, p.name, p.brand, p."packSize" AS packsize, p."packUnit"::text AS packunit, s.code::text AS store
      FROM products p
      JOIN stores s ON s.id = p."storeId"
      WHERE p."isAvailable" = TRUE
        AND similarity(p.name, ${query}) > 0.15
        ${storeFilter}
      ORDER BY similarity(p.name, ${query}) DESC
      LIMIT 5`);

    const prices = await this.prisma.price.findMany({
      where: { productId: { in: rows.map((r) => r.id) } },
      orderBy: [{ productId: 'asc' }, { effectiveAt: 'desc' }],
      distinct: ['productId'],
      select: { productId: true, priceCents: true, isPromo: true, pricePerKgCents: true },
    });
    const priceByProduct = new Map(prices.map((p) => [p.productId, p]));

    return JSON.stringify({
      products: rows.map((r) => {
        const price = priceByProduct.get(r.id);
        return {
          id: r.id,
          name: r.name,
          brand: r.brand,
          store: r.store,
          pack: `${r.packsize}${r.packunit}`,
          priceCents: price?.priceCents ?? null,
          isPromo: price?.isPromo ?? false,
          pricePerKgCents: price?.pricePerKgCents ?? null,
        };
      }),
    });
  }

  private async toolCompareIngredientPrices(ingredientName: string): Promise<string> {
    if (!ingredientName.trim()) return JSON.stringify({ error: 'ingredient is required' });
    const ingredient = await this.pantry.matchIngredient(ingredientName);
    if (!ingredient) {
      return JSON.stringify({ error: `No ingredient matching "${ingredientName}" found` });
    }
    const matches = await this.prisma.productIngredientMatch.findMany({
      where: { ingredientId: ingredient.id },
      orderBy: { similarity: 'desc' },
      take: 40,
      include: {
        product: {
          include: {
            store: { select: { code: true, name: true } },
            prices: { orderBy: { effectiveAt: 'desc' }, take: 1 },
          },
        },
      },
    });

    const cheapestByStore = new Map<
      string,
      { store: string; product: string; priceCents: number; pricePerKgCents: number | null; isPromo: boolean }
    >();
    for (const m of matches) {
      const price = m.product.prices[0];
      if (!price) continue;
      const code = m.product.store.code;
      const existing = cheapestByStore.get(code);
      if (!existing || price.priceCents < existing.priceCents) {
        cheapestByStore.set(code, {
          store: code,
          product: m.product.name,
          priceCents: price.priceCents,
          pricePerKgCents: price.pricePerKgCents,
          isPromo: price.isPromo,
        });
      }
    }

    return JSON.stringify({
      ingredient: ingredient.displayName,
      offers: [...cheapestByStore.values()].sort((x, y) => x.priceCents - y.priceCents),
    });
  }

  private async toolGetPantry(userId: string): Promise<string> {
    const items = await this.pantry.getActiveItems(userId);
    return JSON.stringify({
      count: items.length,
      items: items.slice(0, 50).map((i) => ({
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
        location: i.location,
        expiresAt: i.expiresAt ? i.expiresAt.toISOString().slice(0, 10) : null,
      })),
    });
  }

  private async toolGetRecipes(
    userId: string,
    query?: string,
    maxCostCents?: number,
  ): Promise<string> {
    const recipes = await this.prisma.recipe.findMany({
      where: {
        status: 'READY',
        deletedAt: null,
        OR: [{ isPublic: true }, { userId }],
        ...(query ? { title: { contains: query, mode: 'insensitive' as const } } : {}),
      },
      select: {
        id: true,
        title: true,
        servings: true,
        tags: true,
        nutrition: { select: { calories: true, proteinG: true, healthScore: true } },
        ingredients: { select: { ingredientId: true, normalizedQtyG: true, optional: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });

    const ingredientIds = [
      ...new Set(
        recipes.flatMap((r) =>
          r.ingredients.map((i) => i.ingredientId).filter((id): id is string => id !== null),
        ),
      ),
    ];
    const costs = await fetchIngredientCosts(this.prisma, ingredientIds);

    const enriched = recipes
      .map((r) => {
        const est = estimateRecipeCost(r.ingredients, costs);
        const costPerServingCents = Math.round(est.totalCents / Math.max(1, r.servings));
        return {
          id: r.id,
          title: r.title,
          servings: r.servings,
          tags: r.tags,
          costPerServingCents,
          caloriesPerServing: r.nutrition?.calories ?? null,
          proteinPerServing: r.nutrition?.proteinG ?? null,
          healthScore: r.nutrition?.healthScore ?? null,
        };
      })
      .filter((r) => maxCostCents === undefined || r.costPerServingCents <= maxCostCents)
      .slice(0, 5);

    return JSON.stringify({ recipes: enriched });
  }

  private async toolGetBudgetStatus(userId: string): Promise<string> {
    const profile = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { weeklyBudgetCents: true },
    });
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - ((now.getDay() + 6) % 7)); // Monday

    const agg = await this.prisma.basket.aggregate({
      where: { userId, status: 'PURCHASED', updatedAt: { gte: weekStart } },
      _sum: { totalCents: true, deliveryCents: true },
    });
    const spent = (agg._sum.totalCents ?? 0) + (agg._sum.deliveryCents ?? 0);
    const budget = profile?.weeklyBudgetCents ?? null;
    return JSON.stringify({
      weeklyBudgetCents: budget,
      spentThisWeekCents: spent,
      remainingCents: budget !== null ? budget - spent : null,
      weekStart: weekStart.toISOString().slice(0, 10),
    });
  }

  private async toolSuggestSubstitutions(ingredientName: string): Promise<string> {
    if (!ingredientName.trim()) return JSON.stringify({ error: 'ingredient is required' });
    const ingredient = await this.pantry.matchIngredient(ingredientName);
    if (!ingredient) {
      return JSON.stringify({ error: `No ingredient matching "${ingredientName}" found` });
    }
    const subs = await this.prisma.ingredientSubstitution.findMany({
      where: { fromIngredientId: ingredient.id },
      orderBy: { confidence: 'desc' },
      take: 8,
      include: { toIngredient: { select: { displayName: true } } },
    });
    return JSON.stringify({
      ingredient: ingredient.displayName,
      substitutions: subs.map((s) => ({
        substitute: s.toIngredient.displayName,
        ratio: s.ratio,
        notes: s.notes,
        confidence: s.confidence,
      })),
    });
  }

  // ------------------------------------------------------------------

  private async findOrCreateSession(
    userId: string,
    sessionId: string | undefined,
    firstMessage: string,
  ): Promise<{ id: string }> {
    if (sessionId) {
      const session = await this.prisma.chatSession.findFirst({
        where: { id: sessionId, userId },
        select: { id: true },
      });
      if (!session) throw new NotFoundException('Chat session not found');
      return session;
    }
    return this.prisma.chatSession.create({
      data: { userId, title: firstMessage.slice(0, 40) },
      select: { id: true },
    });
  }

  private messageToDto(m: { id: string; role: string; content: string; createdAt: Date }): ChatMessageDto {
    return {
      id: m.id,
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    };
  }

  private optString(v: unknown): string | undefined {
    return typeof v === 'string' && v.length > 0 ? v : undefined;
  }

  private optNumber(v: unknown): number | undefined {
    return typeof v === 'number' && isFinite(v) ? v : undefined;
  }
}
