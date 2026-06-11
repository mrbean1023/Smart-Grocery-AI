import { AlertScanService } from './alert-scan.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { MetricsService } from '../metrics/metrics.service';
import type { NotificationsService } from '../notifications/notifications.service';

describe('AlertScanService price-drop scan (mocked Prisma/Notifications)', () => {
  const alertFindMany = jest.fn();
  const watchFindMany = jest.fn();
  const priceFindFirst = jest.fn();
  const notificationFindFirst = jest.fn();
  const notify = jest.fn();
  const increment = jest.fn();

  const prisma = {
    alert: { findMany: alertFindMany },
    priceWatch: { findMany: watchFindMany },
    price: { findFirst: priceFindFirst },
    notification: { findFirst: notificationFindFirst },
  } as unknown as PrismaService;

  const notifications = { notify } as unknown as NotificationsService;
  const metrics = { increment } as unknown as MetricsService;

  const service = new AlertScanService(prisma, notifications, metrics);

  const baseAlert = {
    id: 'alert-1',
    userId: 'user-1',
    type: 'PRICE_DROP',
    enabled: true,
    threshold: 10,
    channel: 'both',
    user: { id: 'user-1', email: 'shopper@example.sg', weeklyBudgetCents: null },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    alertFindMany.mockResolvedValueOnce([baseAlert]).mockResolvedValue([]);
  });

  it('notifies when a watched product hits the target price', async () => {
    watchFindMany.mockResolvedValue([
      { id: 'w1', userId: 'user-1', productId: 'prod-1', targetPriceCents: 500, product: { id: 'prod-1', name: 'Jasmine Rice 5kg' } },
    ]);
    priceFindFirst
      .mockResolvedValueOnce({ priceCents: 480 }) // latest
      .mockResolvedValueOnce({ priceCents: 520 }); // 7 days ago
    notificationFindFirst.mockResolvedValue(null); // no duplicate

    await service.scanPriceDrops();

    expect(notify).toHaveBeenCalledTimes(1);
    const [userId, type, title, , data, channel, email] = notify.mock.calls[0];
    expect(userId).toBe('user-1');
    expect(type).toBe('PRICE_DROP');
    expect(title).toContain('Jasmine Rice');
    expect(data).toMatchObject({ productId: 'prod-1', priceCents: 480, reason: 'target' });
    expect(channel).toBe('both');
    expect(email).toBe('shopper@example.sg');
  });

  it('notifies on a >= threshold% drop vs 7 days ago', async () => {
    watchFindMany.mockResolvedValue([
      { id: 'w1', userId: 'user-1', productId: 'prod-2', targetPriceCents: null, product: { id: 'prod-2', name: 'Olive Oil 1L' } },
    ]);
    priceFindFirst
      .mockResolvedValueOnce({ priceCents: 850 }) // latest
      .mockResolvedValueOnce({ priceCents: 1000 }); // week ago: 15% drop
    notificationFindFirst.mockResolvedValue(null);

    await service.scanPriceDrops();

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][4]).toMatchObject({ reason: 'threshold', dropPct: 15 });
  });

  it('does not notify on a small drop', async () => {
    watchFindMany.mockResolvedValue([
      { id: 'w1', userId: 'user-1', productId: 'prod-3', targetPriceCents: null, product: { id: 'prod-3', name: 'Eggs 30s' } },
    ]);
    priceFindFirst
      .mockResolvedValueOnce({ priceCents: 980 })
      .mockResolvedValueOnce({ priceCents: 1000 }); // 2% drop < 10%

    await service.scanPriceDrops();

    expect(notify).not.toHaveBeenCalled();
    expect(notificationFindFirst).not.toHaveBeenCalled();
  });

  it('dedupes: skips when a notification for the product exists within 24h', async () => {
    watchFindMany.mockResolvedValue([
      { id: 'w1', userId: 'user-1', productId: 'prod-1', targetPriceCents: 500, product: { id: 'prod-1', name: 'Jasmine Rice 5kg' } },
    ]);
    priceFindFirst
      .mockResolvedValueOnce({ priceCents: 480 })
      .mockResolvedValueOnce({ priceCents: 520 });
    notificationFindFirst.mockResolvedValue({ id: 'existing-notif' });

    await service.scanPriceDrops();

    expect(notify).not.toHaveBeenCalled();
    // dedupe query is scoped to user/type/product within 24h
    const dedupeArgs = notificationFindFirst.mock.calls[0][0];
    expect(dedupeArgs.where.userId).toBe('user-1');
    expect(dedupeArgs.where.type).toBe('PRICE_DROP');
    expect(dedupeArgs.where.data).toEqual({ path: ['productId'], equals: 'prod-1' });
    expect(dedupeArgs.where.createdAt.gte).toBeInstanceOf(Date);
  });

  it('isolates per-user errors and counts them', async () => {
    watchFindMany.mockRejectedValue(new Error('db down'));

    await expect(service.scanPriceDrops()).resolves.toBeUndefined();
    expect(increment).toHaveBeenCalledWith('alert_scan_errors_total');
    expect(notify).not.toHaveBeenCalled();
  });

  it('skips products with no price history', async () => {
    watchFindMany.mockResolvedValue([
      { id: 'w1', userId: 'user-1', productId: 'prod-4', targetPriceCents: 100, product: { id: 'prod-4', name: 'New Product' } },
    ]);
    priceFindFirst.mockResolvedValueOnce(null); // no latest price

    await service.scanPriceDrops();
    expect(notify).not.toHaveBeenCalled();
  });
});
