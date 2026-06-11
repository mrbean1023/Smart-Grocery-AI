import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AuthTokens } from '@smart-grocery/shared';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser, JwtPayload, RequestContext } from './types';

interface TokenSubject {
  id: string;
  email: string;
  role: AuthUser['role'];
}

/**
 * Access tokens: short-lived JWTs signed with JWT_ACCESS_SECRET.
 * Refresh tokens: opaque random 64-byte hex strings; only the SHA-256 hash is
 * persisted (RefreshToken table) together with expiry / user-agent / IP.
 * Refresh tokens rotate on every use and are revoked on logout.
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private get accessTtlSeconds(): number {
    return this.configService.get<number>('jwt.accessTtl', 900);
  }

  private get refreshTtlSeconds(): number {
    return this.configService.get<number>('jwt.refreshTtl', 2_592_000);
  }

  async signAccessToken(subject: TokenSubject): Promise<string> {
    const payload: JwtPayload = { sub: subject.id, email: subject.email, role: subject.role };
    return this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('jwt.accessSecret'),
      expiresIn: this.accessTtlSeconds,
    });
  }

  /** Issues a new access + refresh token pair and persists the refresh hash. */
  async issueTokenPair(subject: TokenSubject, context?: RequestContext): Promise<AuthTokens> {
    const accessToken = await this.signAccessToken(subject);
    const refreshToken = randomBytes(64).toString('hex');

    await this.prisma.refreshToken.create({
      data: {
        userId: subject.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTtlSeconds * 1000),
        userAgent: context?.userAgent ?? null,
        ip: context?.ip ?? null,
      },
    });

    return { accessToken, refreshToken, expiresIn: this.accessTtlSeconds };
  }

  /**
   * Rotates a refresh token: validates it, revokes the old row, and issues a
   * fresh pair. Throws 401 for unknown / revoked / expired tokens and for
   * deleted users.
   */
  async rotateRefreshToken(rawToken: string, context?: RequestContext): Promise<AuthTokens> {
    const tokenHash = this.hashToken(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (
      !stored ||
      stored.revokedAt !== null ||
      stored.expiresAt.getTime() <= Date.now() ||
      !stored.user ||
      stored.user.deletedAt !== null
    ) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokenPair(
      { id: stored.user.id, email: stored.user.email, role: stored.user.role },
      context,
    );
  }

  /** Revokes a single refresh token. Idempotent — unknown tokens are a no-op. */
  async revokeRefreshToken(rawToken: string): Promise<void> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count > 0) {
      this.logger.log('Refresh token revoked');
    }
  }

  /** Revokes every active refresh token for a user (logout-everywhere). */
  async revokeAllForUser(userId: string): Promise<void> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count > 0) {
      this.logger.log(`Revoked ${result.count} refresh token(s) for user ${userId}`);
    }
  }
}
