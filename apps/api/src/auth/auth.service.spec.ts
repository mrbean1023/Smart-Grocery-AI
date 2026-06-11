import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import type Redis from 'ioredis';
import type { MailService } from '../mail/mail.service';
import type { MetricsService } from '../metrics/metrics.service';
import type { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import type { TokenService } from './token.service';
import type { AuthUser } from './types';

describe('AuthService', () => {
  const now = new Date('2026-06-11T08:00:00.000Z');

  const baseUser = {
    id: 'user-1',
    email: 'jo@example.sg',
    emailVerifiedAt: null as Date | null,
    passwordHash: null as string | null,
    name: 'Jo Tan',
    avatarUrl: null,
    role: 'USER' as const,
    googleId: null as string | null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null as Date | null,
    dietaryRestrictions: [] as string[],
    allergies: [] as string[],
    householdSize: 1,
    weeklyBudgetCents: null,
    preferredStores: [] as string[],
    nutritionGoals: null,
    subscription: {
      id: 'sub-1',
      userId: 'user-1',
      tier: 'FREE' as const,
      status: 'ACTIVE' as const,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripePriceId: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      createdAt: now,
      updatedAt: now,
    },
  };

  const issuedTokens = { accessToken: 'access.jwt', refreshToken: 'f'.repeat(128), expiresIn: 900 };

  let prisma: {
    user: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    verificationToken: { create: jest.Mock; findUnique: jest.Mock; updateMany: jest.Mock };
  };
  let tokenService: {
    issueTokenPair: jest.Mock;
    rotateRefreshToken: jest.Mock;
    revokeRefreshToken: jest.Mock;
    revokeAllForUser: jest.Mock;
  };
  let mailService: { send: jest.Mock };
  let configService: { get: jest.Mock; getOrThrow: jest.Mock };
  let metrics: { increment: jest.Mock; observeHistogram: jest.Mock };
  let redis: { get: jest.Mock; set: jest.Mock; del: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue(baseUser),
      },
      verificationToken: {
        create: jest.fn().mockResolvedValue({ id: 'vt-1' }),
        findUnique: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    tokenService = {
      issueTokenPair: jest.fn().mockResolvedValue(issuedTokens),
      rotateRefreshToken: jest.fn().mockResolvedValue(issuedTokens),
      revokeRefreshToken: jest.fn().mockResolvedValue(undefined),
      revokeAllForUser: jest.fn().mockResolvedValue(undefined),
    };
    mailService = { send: jest.fn().mockResolvedValue(undefined) };
    configService = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        const values: Record<string, unknown> = {
          webUrl: 'http://localhost:3000',
          'google.clientId': 'google-client-id',
        };
        return values[key] ?? defaultValue;
      }),
      getOrThrow: jest.fn(),
    };
    metrics = { increment: jest.fn(), observeHistogram: jest.fn() };
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };

    service = new AuthService(
      prisma as unknown as PrismaService,
      tokenService as unknown as TokenService,
      mailService as unknown as MailService,
      configService as unknown as ConfigService,
      metrics as unknown as MetricsService,
      redis as unknown as Redis,
    );
  });

  describe('register', () => {
    const input = { email: 'Jo@Example.SG', password: 'Str0ngPass!', name: 'Jo Tan' };

    it('throws 409 when the email is already registered', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);
      await expect(service.register(input)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('creates the user with a bcrypt hash, FREE subscription, verification email, and tokens', async () => {
      prisma.user.create.mockImplementation(
        (args: { data: { email: string; name: string; passwordHash: string } }) =>
          Promise.resolve({ ...baseUser, ...args.data, subscription: baseUser.subscription }),
      );

      const result = await service.register(input);

      // Email lower-cased for lookup and storage
      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'jo@example.sg' } });
      const createData = prisma.user.create.mock.calls[0][0].data;
      expect(createData.email).toBe('jo@example.sg');
      expect(createData.subscription).toEqual({ create: { tier: 'FREE', status: 'ACTIVE' } });
      expect(createData.passwordHash).not.toBe(input.password);
      expect(await bcrypt.compare(input.password, createData.passwordHash)).toBe(true);

      // Verification token persisted as a hash with 24h expiry
      const tokenData = prisma.verificationToken.create.mock.calls[0][0].data;
      expect(tokenData.type).toBe('EMAIL_VERIFICATION');
      expect(tokenData.tokenHash).toMatch(/^[0-9a-f]{64}$/);

      // Verification email sent with the raw token link
      expect(mailService.send).toHaveBeenCalledTimes(1);
      const sendArgs = mailService.send.mock.calls[0][0];
      expect(sendArgs.to).toBe('jo@example.sg');
      expect(sendArgs.html).toContain('http://localhost:3000/verify-email?token=');

      expect(result.tokens).toEqual(issuedTokens);
      expect(result.user.email).toBe('jo@example.sg');
      expect(result.user.tier).toBe('FREE');
    });
  });

  describe('login', () => {
    const password = 'Str0ngPass!';
    const storedHash = bcrypt.hashSync(password, 4);

    it('rejects unknown emails with a generic 401', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ email: 'nobody@example.sg', password }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects soft-deleted users', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        passwordHash: storedHash,
        deletedAt: new Date(),
      });
      await expect(
        service.login({ email: 'jo@example.sg', password }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects wrong passwords with a generic 401', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash: storedHash });
      await expect(
        service.login({ email: 'jo@example.sg', password: 'WrongPass1' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(tokenService.issueTokenPair).not.toHaveBeenCalled();
    });

    it('returns profile and tokens on success', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash: storedHash });

      const result = await service.login({ email: 'JO@example.sg', password });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'jo@example.sg' },
        include: { subscription: true },
      });
      expect(result.user.id).toBe('user-1');
      expect(result.user.tier).toBe('FREE');
      expect(result.tokens).toEqual(issuedTokens);
    });
  });

  describe('verifyEmail', () => {
    const storedToken = {
      id: 'vt-1',
      userId: 'user-1',
      tokenHash: 'hash',
      type: 'EMAIL_VERIFICATION',
      usedAt: null as Date | null,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: now,
    };

    it('rejects unknown tokens', async () => {
      prisma.verificationToken.findUnique.mockResolvedValue(null);
      await expect(service.verifyEmail('bogus-token-value')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects expired tokens', async () => {
      prisma.verificationToken.findUnique.mockResolvedValue({
        ...storedToken,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.verifyEmail('expired-token')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('is single-use: a consumed token cannot verify again', async () => {
      prisma.verificationToken.findUnique.mockResolvedValue(storedToken);
      prisma.verificationToken.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.verifyEmail('raced-token')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('marks the user verified, consumes the token, and invalidates the auth cache', async () => {
      prisma.verificationToken.findUnique.mockResolvedValue(storedToken);
      prisma.verificationToken.updateMany.mockResolvedValue({ count: 1 });

      await service.verifyEmail('valid-token');

      expect(prisma.verificationToken.updateMany).toHaveBeenCalledWith({
        where: { id: 'vt-1', usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { emailVerifiedAt: expect.any(Date) },
      });
      expect(redis.del).toHaveBeenCalledWith('authuser:user-1');
    });
  });

  describe('forgotPassword', () => {
    it('resolves silently for unknown emails (no enumeration)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.forgotPassword('nobody@example.sg')).resolves.toBeUndefined();
      expect(mailService.send).not.toHaveBeenCalled();
      expect(prisma.verificationToken.create).not.toHaveBeenCalled();
    });

    it('creates a PASSWORD_RESET token and emails the reset link for known users', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);

      await service.forgotPassword('jo@example.sg');

      const tokenData = prisma.verificationToken.create.mock.calls[0][0].data;
      expect(tokenData.type).toBe('PASSWORD_RESET');
      const sendArgs = mailService.send.mock.calls[0][0];
      expect(sendArgs.to).toBe('jo@example.sg');
      expect(sendArgs.html).toContain('http://localhost:3000/reset-password?token=');
    });
  });

  describe('resetPassword', () => {
    const storedToken = {
      id: 'vt-2',
      userId: 'user-1',
      tokenHash: 'hash',
      type: 'PASSWORD_RESET',
      usedAt: null as Date | null,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: now,
    };

    it('rejects invalid or expired tokens', async () => {
      prisma.verificationToken.findUnique.mockResolvedValue(null);
      await expect(
        service.resetPassword('bogus-token-value', 'NewStr0ngPass'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('updates the password hash and revokes all refresh tokens', async () => {
      prisma.verificationToken.findUnique.mockResolvedValue(storedToken);

      await service.resetPassword('valid-reset-token', 'NewStr0ngPass');

      const updateArgs = prisma.user.update.mock.calls[0][0];
      expect(updateArgs.where).toEqual({ id: 'user-1' });
      expect(await bcrypt.compare('NewStr0ngPass', updateArgs.data.passwordHash)).toBe(true);
      expect(tokenService.revokeAllForUser).toHaveBeenCalledWith('user-1');
      expect(redis.del).toHaveBeenCalledWith('authuser:user-1');
    });
  });

  describe('refresh / logout', () => {
    it('delegates refresh to TokenService rotation', async () => {
      const tokens = await service.refresh('some-refresh-token');
      expect(tokenService.rotateRefreshToken).toHaveBeenCalledWith('some-refresh-token', undefined);
      expect(tokens).toEqual(issuedTokens);
    });

    it('logout revokes the refresh token', async () => {
      await service.logout('some-refresh-token');
      expect(tokenService.revokeRefreshToken).toHaveBeenCalledWith('some-refresh-token');
    });
  });

  describe('resendVerification', () => {
    const authUser: AuthUser = { id: 'user-1', email: 'jo@example.sg', role: 'USER', tier: 'FREE' };

    it('is a no-op for already-verified users', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...baseUser, emailVerifiedAt: new Date() });
      await service.resendVerification(authUser);
      expect(mailService.send).not.toHaveBeenCalled();
    });

    it('invalidates outstanding tokens and sends a fresh verification email', async () => {
      prisma.user.findUnique.mockResolvedValue(baseUser);

      await service.resendVerification(authUser);

      expect(prisma.verificationToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', type: 'EMAIL_VERIFICATION', usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
      expect(prisma.verificationToken.create).toHaveBeenCalledTimes(1);
      expect(mailService.send).toHaveBeenCalledTimes(1);
    });
  });
});
