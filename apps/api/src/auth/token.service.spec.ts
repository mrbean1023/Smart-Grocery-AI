import { UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';
import type { PrismaService } from '../prisma/prisma.service';
import { TokenService } from './token.service';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

describe('TokenService', () => {
  const configValues: Record<string, unknown> = {
    'jwt.accessSecret': 'test-access-secret',
    'jwt.refreshSecret': 'test-refresh-secret',
    'jwt.accessTtl': 900,
    'jwt.refreshTtl': 2_592_000,
  };

  let prisma: {
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let jwtService: { signAsync: jest.Mock };
  let configService: { get: jest.Mock; getOrThrow: jest.Mock };
  let service: TokenService;

  const subject = { id: 'user-1', email: 'jo@example.sg', role: 'USER' as const };

  beforeEach(() => {
    prisma = {
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 'rt-1' }),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    jwtService = { signAsync: jest.fn().mockResolvedValue('signed.access.jwt') };
    configService = {
      get: jest.fn((key: string, defaultValue?: unknown) => configValues[key] ?? defaultValue),
      getOrThrow: jest.fn((key: string) => {
        const value = configValues[key];
        if (value === undefined) throw new Error(`Missing config ${key}`);
        return value;
      }),
    };

    service = new TokenService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
    );
  });

  describe('issueTokenPair', () => {
    it('returns an access token, an opaque 128-char hex refresh token, and expiresIn', async () => {
      const tokens = await service.issueTokenPair(subject);

      expect(tokens.accessToken).toBe('signed.access.jwt');
      expect(tokens.refreshToken).toMatch(/^[0-9a-f]{128}$/);
      expect(tokens.expiresIn).toBe(900);
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        { sub: 'user-1', email: 'jo@example.sg', role: 'USER' },
        expect.objectContaining({ secret: 'test-access-secret', expiresIn: 900 }),
      );
    });

    it('stores only the SHA-256 hash of the refresh token, with expiry and request context', async () => {
      const before = Date.now();
      const tokens = await service.issueTokenPair(subject, {
        userAgent: 'jest-agent',
        ip: '127.0.0.1',
      });

      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
      const createArgs = prisma.refreshToken.create.mock.calls[0][0];
      expect(createArgs.data.tokenHash).toBe(sha256(tokens.refreshToken));
      expect(createArgs.data.tokenHash).not.toBe(tokens.refreshToken);
      expect(createArgs.data.userId).toBe('user-1');
      expect(createArgs.data.userAgent).toBe('jest-agent');
      expect(createArgs.data.ip).toBe('127.0.0.1');

      const expiresAt = (createArgs.data.expiresAt as Date).getTime();
      expect(expiresAt).toBeGreaterThanOrEqual(before + 2_592_000 * 1000 - 5000);
      expect(expiresAt).toBeLessThanOrEqual(Date.now() + 2_592_000 * 1000 + 5000);
    });
  });

  describe('rotateRefreshToken', () => {
    const raw = 'a'.repeat(128);
    const validRow = {
      id: 'rt-1',
      userId: 'user-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'user-1', email: 'jo@example.sg', role: 'USER', deletedAt: null },
    };

    it('revokes the old token and issues a new pair', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(validRow);

      const tokens = await service.rotateRefreshToken(raw);

      expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: sha256(raw) },
        include: { user: true },
      });
      expect(prisma.refreshToken.update).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
      expect(tokens.refreshToken).toMatch(/^[0-9a-f]{128}$/);
      expect(tokens.refreshToken).not.toBe(raw);
    });

    it('rejects unknown tokens', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(service.rotateRefreshToken(raw)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshToken.update).not.toHaveBeenCalled();
    });

    it('rejects revoked tokens', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({ ...validRow, revokedAt: new Date() });
      await expect(service.rotateRefreshToken(raw)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects expired tokens', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        ...validRow,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.rotateRefreshToken(raw)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects tokens belonging to soft-deleted users', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        ...validRow,
        user: { ...validRow.user, deletedAt: new Date() },
      });
      await expect(service.rotateRefreshToken(raw)).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('revokeRefreshToken', () => {
    it('revokes by hash and is idempotent for unknown tokens', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.revokeRefreshToken('unknown-token')).resolves.toBeUndefined();
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: sha256('unknown-token'), revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('revokeAllForUser', () => {
    it('revokes every active token for the user', async () => {
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });
      await service.revokeAllForUser('user-1');
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });
});
