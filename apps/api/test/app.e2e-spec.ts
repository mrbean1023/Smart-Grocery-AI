/**
 * End-to-end suite against the full application module.
 * Requires the dev infrastructure (Postgres on 5433, Redis) and a seeded DB:
 *   docker compose up -d postgres redis && npm run db:migrate:dev && npm run db:seed
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Smart Grocery AI API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<INestApplication['getHttpServer']>;

  const email = `e2e-${Date.now()}@test.local`;
  const password = 'E2eTest1234';
  let accessToken = '';
  let refreshToken = '';
  let recipeId = '';

  const auth = () => ({ Authorization: `Bearer ${accessToken}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('v1', { exclude: ['metrics', 'healthz'] });
    await app.init();
    prisma = app.get(PrismaService);
    http = app.getHttpServer();
  });

  afterAll(async () => {
    // Clean up the throwaway user (cascades to tokens/usage/recipes via FK rules)
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  describe('health', () => {
    it('GET /v1/health → 200 ok', async () => {
      const res = await request(http).get('/v1/health').expect(200);
      expect(res.body.status).toBe('ok');
    });

    it('GET /v1/health/ready → 200 with dependency status', async () => {
      const res = await request(http).get('/v1/health/ready').expect(200);
      expect(res.body.dependencies ?? res.body.checks ?? res.body).toBeDefined();
    });
  });

  describe('auth', () => {
    it('rejects a weak password on register', async () => {
      await request(http)
        .post('/v1/auth/register')
        .send({ email, password: 'weak', name: 'E2E' })
        .expect(400);
    });

    it('registers a new user', async () => {
      const res = await request(http)
        .post('/v1/auth/register')
        .send({ email, password, name: 'E2E Tester' })
        .expect(201);
      expect(res.body.user.email).toBe(email);
      expect(res.body.user.tier).toBe('FREE');
      expect(res.body.tokens.accessToken).toBeTruthy();
    });

    it('rejects duplicate registration', async () => {
      await request(http)
        .post('/v1/auth/register')
        .send({ email, password, name: 'E2E Tester' })
        .expect(409);
    });

    it('rejects bad credentials', async () => {
      await request(http)
        .post('/v1/auth/login')
        .send({ email, password: 'Wrong1234' })
        .expect(401);
    });

    it('logs in and returns tokens', async () => {
      const res = await request(http).post('/v1/auth/login').send({ email, password }).expect(200);
      accessToken = res.body.tokens.accessToken;
      refreshToken = res.body.tokens.refreshToken;
      expect(accessToken).toBeTruthy();
    });

    it('GET /v1/users/me returns the profile', async () => {
      const res = await request(http).get('/v1/users/me').set(auth()).expect(200);
      expect(res.body.email).toBe(email);
    });

    it('rotates refresh tokens', async () => {
      const res = await request(http)
        .post('/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);
      expect(res.body.accessToken).toBeTruthy();
      // Old refresh token is revoked after rotation
      await request(http).post('/v1/auth/refresh').send({ refreshToken }).expect(401);
      refreshToken = res.body.refreshToken;
      accessToken = res.body.accessToken;
    });

    it('blocks protected routes without a token', async () => {
      await request(http).get('/v1/users/me').expect(401);
    });
  });

  describe('catalogue (seeded)', () => {
    it('lists the 7 Singapore stores publicly', async () => {
      const res = await request(http).get('/v1/stores').expect(200);
      expect(res.body).toHaveLength(7);
      const codes = res.body.map((s: { code: string }) => s.code);
      expect(codes).toEqual(
        expect.arrayContaining(['FAIRPRICE', 'SHENG_SIONG', 'GIANT', 'COLD_STORAGE', 'PRIME', 'REDMART', 'AMAZON_FRESH']),
      );
    });

    it('searches products with prices', async () => {
      const res = await request(http)
        .get('/v1/products/search')
        .query({ q: 'jasmine rice', pageSize: 5 })
        .expect(200);
      expect(res.body.total).toBeGreaterThan(0);
      expect(res.body.items[0].currentPrice?.priceCents).toBeGreaterThan(0);
    });

    it('searches ingredients', async () => {
      const res = await request(http)
        .get('/v1/ingredients/search')
        .query({ q: 'chicken' })
        .set(auth())
        .expect(200);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('returns price history for a product', async () => {
      const search = await request(http)
        .get('/v1/products/search')
        .query({ q: 'chicken breast', pageSize: 1 })
        .expect(200);
      const productId = search.body.items[0].id;
      const res = await request(http).get(`/v1/products/${productId}/history`).query({ days: 90 }).expect(200);
      expect(res.body.length).toBeGreaterThan(4);
    });
  });

  describe('recipes', () => {
    it('creates a manual recipe synchronously with matching + nutrition', async () => {
      const res = await request(http)
        .post('/v1/recipes')
        .set(auth())
        .send({
          title: 'E2E Garlic Fried Rice',
          servings: 2,
          instructions: ['Fry garlic.', 'Add rice and soy sauce.'],
          ingredients: [
            { rawText: '300 g jasmine rice' },
            { rawText: '3 cloves garlic, minced' },
            { rawText: '2 tbsp light soy sauce' },
            { rawText: '2 eggs' },
          ],
        })
        .expect(201);
      recipeId = res.body.id;
      expect(res.body.status).toBe('READY');
      expect(res.body.ingredients).toHaveLength(4);
      const matched = res.body.ingredients.filter(
        (i: { ingredient: unknown | null }) => i.ingredient !== null,
      );
      expect(matched.length).toBeGreaterThanOrEqual(3);
      expect(res.body.nutrition?.calories).toBeGreaterThan(0);
    });

    it('lists own + public recipes', async () => {
      const res = await request(http).get('/v1/recipes').set(auth()).expect(200);
      expect(res.body.total).toBeGreaterThanOrEqual(13); // 12 seeded public + ours
    });
  });

  describe('basket optimization & quotas', () => {
    it('optimizes a recipe into 4 strategies', async () => {
      const res = await request(http)
        .post('/v1/baskets/optimize')
        .set(auth())
        .send({ recipeId, strategy: 'CHEAPEST', servingsMultiplier: 1, excludeStores: [], usePantry: false })
        .expect(201);
      expect(res.body.results).toHaveLength(4);
      const strategies = res.body.results.map((r: { strategy: string }) => r.strategy);
      expect(strategies).toEqual(
        expect.arrayContaining(['CHEAPEST', 'CONVENIENCE', 'DELIVERY', 'QUALITY']),
      );
      const cheapest = res.body.results.find((r: { strategy: string }) => r.strategy === 'CHEAPEST');
      expect(cheapest.totalCents).toBeGreaterThan(0);
    });

    it('enforces the free-tier daily optimization quota (402)', async () => {
      const res = await request(http)
        .post('/v1/baskets/optimize')
        .set(auth())
        .send({ recipeId, strategy: 'CHEAPEST', servingsMultiplier: 1, excludeStores: [], usePantry: false });
      // FREE tier: 1/day → the second call must be rejected with the upgrade code
      expect(res.status).toBe(402);
      expect(res.body.code).toBe('QUOTA_EXCEEDED');
    });

    it('gates premium features for free users (402 PREMIUM_REQUIRED)', async () => {
      const res = await request(http)
        .post('/v1/meal-plans/generate')
        .set(auth())
        .send({ period: 'WEEKLY', startDate: new Date().toISOString().slice(0, 10) });
      expect(res.status).toBe(402);
      expect(res.body.code).toBe('PREMIUM_REQUIRED');
    });
  });

  describe('pantry', () => {
    it('creates, lists and consumes a pantry item', async () => {
      const created = await request(http)
        .post('/v1/pantry')
        .set(auth())
        .send({ name: 'jasmine rice', quantity: 1000, unit: 'g', location: 'PANTRY' })
        .expect(201);
      expect(created.body.ingredient?.displayName ?? created.body.name).toBeTruthy();

      const list = await request(http).get('/v1/pantry').set(auth()).expect(200);
      expect(list.body.length).toBeGreaterThanOrEqual(1);

      await request(http)
        .patch(`/v1/pantry/${created.body.id}`)
        .set(auth())
        .send({ consumed: true })
        .expect(200);

      const after = await request(http).get('/v1/pantry').set(auth()).expect(200);
      expect(after.body.find((i: { id: string }) => i.id === created.body.id)).toBeUndefined();
    });
  });

  describe('analytics & notifications', () => {
    it('returns the analytics summary', async () => {
      const res = await request(http).get('/v1/analytics/summary').set(auth()).expect(200);
      expect(res.body.inflationTrend).toBeDefined();
      expect(res.body.pantryWaste).toBeDefined();
    });

    it('returns unread notification count', async () => {
      const res = await request(http).get('/v1/notifications/unread-count').set(auth()).expect(200);
      expect(typeof res.body.count).toBe('number');
    });
  });
});
