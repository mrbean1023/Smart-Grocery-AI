import { HttpException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { MetricsService } from '../metrics/metrics.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/types';
import { QuotaService } from './quota.service';

describe('QuotaService', () => {
  const freeUser: AuthUser = { id: 'user-1', email: 'jo@example.sg', role: 'USER', tier: 'FREE' };
  const premiumUser: AuthUser = { ...freeUser, id: 'user-2', tier: 'PREMIUM' };

  let prisma: { usageRecord: { upsert: jest.Mock; findUnique: jest.Mock } };
  let metrics: { increment: jest.Mock; observeHistogram: jest.Mock };

  const makeConfig = (values: Record<string, unknown>) =>
    ({
      get: jest.fn((key: string, defaultValue?: unknown) =>
        key in values ? values[key] : defaultValue,
      ),
      getOrThrow: jest.fn(),
    }) as unknown as ConfigService;

  const makeService = (configValues: Record<string, unknown> = {}) =>
    new QuotaService(
      prisma as unknown as PrismaService,
      metrics as unknown as MetricsService,
      makeConfig({
        'freemium.enforced': true,
        'freemium.scansPerMonth': 5,
        'freemium.optimizationsPerDay': 1,
        ...configValues,
      }),
    );

  beforeEach(() => {
    prisma = {
      usageRecord: {
        upsert: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    metrics = { increment: jest.fn(), observeHistogram: jest.fn() };
  });

  describe('assertAndConsume', () => {
    it('is a no-op for PREMIUM users', async () => {
      const service = makeService();
      await service.assertAndConsume(premiumUser, 'RECIPE_SCAN');
      expect(prisma.usageRecord.upsert).not.toHaveBeenCalled();
    });

    it('is a no-op when FREEMIUM_ENFORCED is false', async () => {
      const service = makeService({ 'freemium.enforced': false });
      await service.assertAndConsume(freeUser, 'AI_CHAT_MESSAGE');
      expect(prisma.usageRecord.upsert).not.toHaveBeenCalled();
    });

    it('atomically increments usage with a monthly periodKey for RECIPE_SCAN', async () => {
      prisma.usageRecord.upsert.mockResolvedValue({ count: 3 });
      const service = makeService();

      await service.assertAndConsume(freeUser, 'RECIPE_SCAN');

      const args = prisma.usageRecord.upsert.mock.calls[0][0];
      expect(args.where.userId_kind_periodKey.userId).toBe('user-1');
      expect(args.where.userId_kind_periodKey.kind).toBe('RECIPE_SCAN');
      expect(args.where.userId_kind_periodKey.periodKey).toMatch(/^\d{4}-\d{2}$/);
      expect(args.create).toEqual(
        expect.objectContaining({ userId: 'user-1', kind: 'RECIPE_SCAN', count: 1 }),
      );
      expect(args.update).toEqual({ count: { increment: 1 } });
    });

    it('uses a daily periodKey for BASKET_OPTIMIZATION and AI_CHAT_MESSAGE', async () => {
      const service = makeService();
      await service.assertAndConsume(freeUser, 'BASKET_OPTIMIZATION');
      await service.assertAndConsume(freeUser, 'AI_CHAT_MESSAGE');

      for (const call of prisma.usageRecord.upsert.mock.calls) {
        expect(call[0].where.userId_kind_periodKey.periodKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });

    it('allows usage exactly at the limit', async () => {
      prisma.usageRecord.upsert.mockResolvedValue({ count: 5 });
      const service = makeService();
      await expect(service.assertAndConsume(freeUser, 'RECIPE_SCAN')).resolves.toBeUndefined();
    });

    it('throws 402 QUOTA_EXCEEDED once over the limit', async () => {
      prisma.usageRecord.upsert.mockResolvedValue({ count: 6 });
      const service = makeService();

      let caught: HttpException | undefined;
      try {
        await service.assertAndConsume(freeUser, 'RECIPE_SCAN');
      } catch (error) {
        caught = error as HttpException;
      }

      expect(caught).toBeInstanceOf(HttpException);
      expect(caught?.getStatus()).toBe(402);
      const body = caught?.getResponse() as Record<string, unknown>;
      expect(body.code).toBe('QUOTA_EXCEEDED');
      expect(body.kind).toBe('RECIPE_SCAN');
      expect(body.limit).toBe(5);
      expect(metrics.increment).toHaveBeenCalledWith('quota_exceeded_total', {
        kind: 'RECIPE_SCAN',
      });
    });

    it('enforces the AI chat limit of 10 per day', async () => {
      prisma.usageRecord.upsert.mockResolvedValue({ count: 11 });
      const service = makeService();

      await expect(service.assertAndConsume(freeUser, 'AI_CHAT_MESSAGE')).rejects.toMatchObject({
        status: 402,
      });
    });

    it('enforces a daily basket optimization limit of 1', async () => {
      prisma.usageRecord.upsert.mockResolvedValue({ count: 2 });
      const service = makeService();

      await expect(
        service.assertAndConsume(freeUser, 'BASKET_OPTIMIZATION'),
      ).rejects.toBeInstanceOf(HttpException);
    });
  });

  describe('getUsage', () => {
    it('returns an entry per quota kind with used counts and limits', async () => {
      prisma.usageRecord.findUnique.mockImplementation(
        (args: { where: { userId_kind_periodKey: { kind: string } } }) =>
          Promise.resolve(
            args.where.userId_kind_periodKey.kind === 'RECIPE_SCAN' ? { count: 4 } : null,
          ),
      );
      const service = makeService();

      const usage = await service.getUsage(freeUser);

      expect(usage).toHaveLength(4);
      const scan = usage.find((entry) => entry.kind === 'RECIPE_SCAN');
      expect(scan).toEqual(
        expect.objectContaining({ used: 4, limit: 5, period: expect.stringMatching(/^\d{4}-\d{2}$/) }),
      );
      const chat = usage.find((entry) => entry.kind === 'AI_CHAT_MESSAGE');
      expect(chat).toEqual(expect.objectContaining({ used: 0, limit: 10 }));
    });

    it('reports null limits (unlimited) for PREMIUM users', async () => {
      const service = makeService();
      const usage = await service.getUsage(premiumUser);
      expect(usage.every((entry) => entry.limit === null)).toBe(true);
    });
  });

  describe('assertPremium', () => {
    it('allows PREMIUM users', () => {
      const service = makeService();
      expect(() => service.assertPremium(premiumUser, 'Meal planning')).not.toThrow();
    });

    it('allows everyone when enforcement is disabled', () => {
      const service = makeService({ 'freemium.enforced': false });
      expect(() => service.assertPremium(freeUser, 'Price forecasting')).not.toThrow();
    });

    it('throws 402 PREMIUM_REQUIRED for free users', () => {
      const service = makeService();

      let caught: HttpException | undefined;
      try {
        service.assertPremium(freeUser, 'Meal planning');
      } catch (error) {
        caught = error as HttpException;
      }

      expect(caught).toBeInstanceOf(HttpException);
      expect(caught?.getStatus()).toBe(402);
      const body = caught?.getResponse() as Record<string, unknown>;
      expect(body.code).toBe('PREMIUM_REQUIRED');
      expect(body.message).toContain('Meal planning');
    });
  });
});
