import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import Redis from 'ioredis';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { authUserCacheKey, AuthUser, JwtPayload } from './types';

const AUTH_CACHE_TTL_SECONDS = 60;

/**
 * Bearer JWT strategy. On every request the user (+ subscription tier) is
 * loaded from a 60s Redis cache, falling back to Prisma — soft-deleted users
 * are rejected even while holding a valid token.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('jwt.accessSecret'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    const cacheKey = authUserCacheKey(payload.sub);

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as AuthUser;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Auth cache read failed (falling back to DB): ${message}`);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { subscription: true },
    });

    if (!user || user.deletedAt !== null) {
      throw new UnauthorizedException('User account is no longer active');
    }

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      tier: user.subscription?.tier ?? 'FREE',
    };

    try {
      await this.redis.set(cacheKey, JSON.stringify(authUser), 'EX', AUTH_CACHE_TTL_SECONDS);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Auth cache write failed: ${message}`);
    }

    return authUser;
  }
}
