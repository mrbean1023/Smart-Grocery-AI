import { PantryService } from './pantry.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { QuotaService } from '../billing/quota.service';
import type { OpenAiService } from '../ai/openai.service';
import type { StorageService } from '../storage/storage.service';

describe('PantryService (mocked Prisma)', () => {
  const findMany = jest.fn();
  const prisma = { pantryItem: { findMany } } as unknown as PrismaService;
  const service = new PantryService(
    prisma,
    {} as QuotaService,
    {} as OpenAiService,
    {} as StorageService,
  );

  beforeEach(() => findMany.mockReset());

  it('coverageForIngredients aggregates grams per ingredient', async () => {
    findMany.mockResolvedValue([
      { ingredientId: 'a', quantity: 1, unit: 'kg', ingredient: { density: null, gramsPerPiece: null } },
      { ingredientId: 'a', quantity: 200, unit: 'g', ingredient: { density: null, gramsPerPiece: null } },
      { ingredientId: 'b', quantity: 2, unit: 'cup', ingredient: { density: 1, gramsPerPiece: null } },
    ]);
    const map = await service.coverageForIngredients('user-1', ['a', 'b']);
    expect(map.get('a')).toBe(1200);
    expect(map.get('b')).toBe(500); // 2 metric cups x 250 ml x 1 g/ml
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          consumedAt: null,
          wasted: false,
          ingredientId: { in: ['a', 'b'] },
        }),
      }),
    );
  });

  it('coverageForIngredients short-circuits on empty input', async () => {
    const map = await service.coverageForIngredients('user-1', []);
    expect(map.size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('getExpiring queries only unconsumed items expiring within N days', async () => {
    findMany.mockResolvedValue([
      {
        id: 'p1',
        name: 'milk',
        quantity: 1,
        unit: 'l',
        location: 'FRIDGE',
        expiresAt: new Date(Date.now() + 2 * 86_400_000),
        purchasedAt: null,
        ingredient: null,
      },
    ]);
    const before = Date.now();
    const items = await service.getExpiring('user-1', 5);
    expect(items).toHaveLength(1);
    expect(items[0].daysUntilExpiry).toBeLessThanOrEqual(2);

    const call = findMany.mock.calls[0][0];
    expect(call.where.userId).toBe('user-1');
    expect(call.where.consumedAt).toBeNull();
    expect(call.where.wasted).toBe(false);
    expect(call.where.expiresAt.not).toBeNull();
    const boundary: Date = call.where.expiresAt.lte;
    // boundary should be ~5 days from now
    expect(boundary.getTime()).toBeGreaterThanOrEqual(before + 5 * 86_400_000 - 5000);
    expect(boundary.getTime()).toBeLessThanOrEqual(Date.now() + 5 * 86_400_000 + 5000);
  });
});
