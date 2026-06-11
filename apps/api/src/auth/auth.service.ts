import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthResponse, AuthTokens, LoginInput, RegisterInput } from '@smart-grocery/shared';
import axios from 'axios';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import Redis from 'ioredis';
import { MailService, passwordResetEmail, verificationEmail } from '../mail/mail.service';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { TokenService } from './token.service';
import { authUserCacheKey, AuthUser, RequestContext } from './types';
import { toUserProfile, UserWithSubscription } from './user-profile.mapper';

const BCRYPT_ROUNDS = 12;
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1h
const GOOGLE_TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';

/** Mirrors the Prisma VerificationTokenType enum (kept as literals so this
 *  module has no runtime dependency on the generated client). */
type VerificationTokenKind = 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';

/** Duck-typed check for Prisma unique-constraint violations (P2002). */
function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

interface GoogleTokenInfo {
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  picture?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly metrics: MetricsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // ---------------------------------------------------------------- register

  async register(input: RegisterInput, context?: RequestContext): Promise<AuthResponse> {
    const email = input.email.toLowerCase();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    let user: UserWithSubscription;
    try {
      user = await this.prisma.user.create({
        data: {
          email,
          name: input.name,
          passwordHash,
          subscription: { create: { tier: 'FREE', status: 'ACTIVE' } },
        },
        include: { subscription: true },
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException('An account with this email already exists');
      }
      throw error;
    }

    await this.sendVerificationEmail(user.id, user.email);

    const tokens = await this.tokenService.issueTokenPair(user, context);
    this.metrics.increment('auth_registrations_total');
    this.logger.log(`New user registered: ${user.id}`);

    return { user: toUserProfile(user), tokens };
  }

  // ------------------------------------------------------------------- login

  async login(input: LoginInput, context?: RequestContext): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      include: { subscription: true },
    });

    // Generic message on every failure path — no account enumeration.
    if (!user || user.deletedAt !== null || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const passwordValid = await bcrypt.compare(input.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.tokenService.issueTokenPair(user, context);
    this.metrics.increment('auth_logins_total', { method: 'password' });

    return { user: toUserProfile(user), tokens };
  }

  // ----------------------------------------------------------- google oauth

  async loginWithGoogle(idToken: string, context?: RequestContext): Promise<AuthResponse> {
    const clientId = this.configService.get<string | undefined>('google.clientId');
    if (!clientId) {
      throw new ServiceUnavailableException('Google sign-in is not configured');
    }

    let info: GoogleTokenInfo;
    try {
      const response = await axios.get<GoogleTokenInfo>(GOOGLE_TOKENINFO_URL, {
        params: { id_token: idToken },
        timeout: 5000,
      });
      info = response.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Google token verification failed: ${message}`);
      throw new UnauthorizedException('Invalid Google token');
    }

    const emailVerified = info.email_verified === true || info.email_verified === 'true';
    if (info.aud !== clientId || !info.sub || !info.email || !emailVerified) {
      throw new UnauthorizedException('Invalid Google token');
    }

    const email = info.email.toLowerCase();
    const googleId = info.sub;

    let user = await this.prisma.user.findUnique({
      where: { googleId },
      include: { subscription: true },
    });

    if (user && user.deletedAt !== null) {
      throw new UnauthorizedException('User account is no longer active');
    }

    if (!user) {
      const byEmail = await this.prisma.user.findUnique({
        where: { email },
        include: { subscription: true },
      });

      if (byEmail) {
        if (byEmail.deletedAt !== null) {
          throw new UnauthorizedException('User account is no longer active');
        }
        // Link the Google identity to the existing email account.
        user = await this.prisma.user.update({
          where: { id: byEmail.id },
          data: {
            googleId,
            emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date(),
            avatarUrl: byEmail.avatarUrl ?? info.picture ?? null,
          },
          include: { subscription: true },
        });
        await this.invalidateAuthCache(user.id);
      } else {
        user = await this.prisma.user.create({
          data: {
            email,
            name: info.name ?? email.split('@')[0],
            googleId,
            emailVerifiedAt: new Date(),
            avatarUrl: info.picture ?? null,
            subscription: { create: { tier: 'FREE', status: 'ACTIVE' } },
          },
          include: { subscription: true },
        });
        this.metrics.increment('auth_registrations_total', { method: 'google' });
        this.logger.log(`New user registered via Google: ${user.id}`);
      }
    }

    const tokens = await this.tokenService.issueTokenPair(user, context);
    this.metrics.increment('auth_logins_total', { method: 'google' });

    return { user: toUserProfile(user), tokens };
  }

  // ------------------------------------------------------- refresh / logout

  async refresh(refreshToken: string, context?: RequestContext): Promise<AuthTokens> {
    return this.tokenService.rotateRefreshToken(refreshToken, context);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokenService.revokeRefreshToken(refreshToken);
  }

  // ------------------------------------------------------ email verification

  async verifyEmail(rawToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    const stored = await this.prisma.verificationToken.findUnique({ where: { tokenHash } });

    if (
      !stored ||
      stored.type !== 'EMAIL_VERIFICATION' ||
      stored.usedAt !== null ||
      stored.expiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    // Atomic single-use consumption — protects against concurrent submits.
    const consumed = await this.prisma.verificationToken.updateMany({
      where: { id: stored.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (consumed.count === 0) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.prisma.user.update({
      where: { id: stored.userId },
      data: { emailVerifiedAt: new Date() },
    });
    await this.invalidateAuthCache(stored.userId);
    this.metrics.increment('auth_email_verifications_total');
  }

  async resendVerification(authUser: AuthUser): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: authUser.id } });
    if (!user || user.deletedAt !== null) {
      throw new UnauthorizedException('User account is no longer active');
    }
    if (user.emailVerifiedAt !== null) {
      return; // already verified — nothing to do
    }

    // Invalidate previous outstanding verification tokens.
    await this.prisma.verificationToken.updateMany({
      where: { userId: user.id, type: 'EMAIL_VERIFICATION', usedAt: null },
      data: { usedAt: new Date() },
    });

    await this.sendVerificationEmail(user.id, user.email);
  }

  // ---------------------------------------------------------- password reset

  /** Always resolves (204) regardless of whether the email exists. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || user.deletedAt !== null) {
      this.logger.log('Password reset requested for unknown email (suppressed)');
      return;
    }

    const rawToken = await this.createVerificationToken(
      user.id,
      'PASSWORD_RESET',
      PASSWORD_RESET_TTL_MS,
    );
    const webUrl = this.configService.get<string>('webUrl', 'http://localhost:3000');
    const { subject, html } = passwordResetEmail(`${webUrl}/reset-password?token=${rawToken}`);
    await this.mailService.send({ to: user.email, subject, html });
    this.metrics.increment('auth_password_reset_requests_total');
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    const stored = await this.prisma.verificationToken.findUnique({ where: { tokenHash } });

    if (
      !stored ||
      stored.type !== 'PASSWORD_RESET' ||
      stored.usedAt !== null ||
      stored.expiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    const consumed = await this.prisma.verificationToken.updateMany({
      where: { id: stored.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (consumed.count === 0) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: stored.userId },
      data: { passwordHash },
    });

    // Force re-login everywhere after a password change.
    await this.tokenService.revokeAllForUser(stored.userId);
    await this.invalidateAuthCache(stored.userId);
    this.metrics.increment('auth_password_resets_total');
    this.logger.log(`Password reset completed for user ${stored.userId}`);
  }

  // ----------------------------------------------------------------- helpers

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private async createVerificationToken(
    userId: string,
    type: VerificationTokenKind,
    ttlMs: number,
  ): Promise<string> {
    const rawToken = randomBytes(48).toString('hex');
    await this.prisma.verificationToken.create({
      data: {
        userId,
        type,
        tokenHash: this.hashToken(rawToken),
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });
    return rawToken;
  }

  private async sendVerificationEmail(userId: string, email: string): Promise<void> {
    const rawToken = await this.createVerificationToken(
      userId,
      'EMAIL_VERIFICATION',
      EMAIL_VERIFICATION_TTL_MS,
    );
    const webUrl = this.configService.get<string>('webUrl', 'http://localhost:3000');
    const { subject, html } = verificationEmail(`${webUrl}/verify-email?token=${rawToken}`);
    await this.mailService.send({ to: email, subject, html });
  }

  private async invalidateAuthCache(userId: string): Promise<void> {
    try {
      await this.redis.del(authUserCacheKey(userId));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to invalidate auth cache for ${userId}: ${message}`);
    }
  }
}
