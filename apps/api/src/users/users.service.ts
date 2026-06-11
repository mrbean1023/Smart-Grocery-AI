import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { UserProfile } from '@smart-grocery/shared';
import { updateProfileSchema } from '@smart-grocery/shared';
import Redis from 'ioredis';
import { z } from 'zod';
import { TokenService } from '../auth/token.service';
import { authUserCacheKey, AuthUser } from '../auth/types';
import { toUserProfile } from '../auth/user-profile.mapper';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly metrics: MetricsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async getProfile(authUser: AuthUser): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: authUser.id },
      include: { subscription: true },
    });
    if (!user || user.deletedAt !== null) {
      throw new NotFoundException('User not found');
    }
    return toUserProfile(user);
  }

  async updateProfile(authUser: AuthUser, input: UpdateProfileInput): Promise<UserProfile> {
    const data: Prisma.UserUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.dietaryRestrictions !== undefined) data.dietaryRestrictions = input.dietaryRestrictions;
    if (input.allergies !== undefined) data.allergies = input.allergies;
    if (input.householdSize !== undefined) data.householdSize = input.householdSize;
    if (input.weeklyBudgetCents !== undefined) data.weeklyBudgetCents = input.weeklyBudgetCents;
    if (input.preferredStores !== undefined) data.preferredStores = input.preferredStores;
    if (input.nutritionGoals !== undefined) {
      data.nutritionGoals = input.nutritionGoals as Prisma.InputJsonValue;
    }

    const user = await this.prisma.user.update({
      where: { id: authUser.id },
      data,
      include: { subscription: true },
    });

    await this.invalidateAuthCache(authUser.id);
    this.metrics.increment('users_profile_updates_total');
    return toUserProfile(user);
  }

  /**
   * Soft delete: sets deletedAt, anonymizes the email (keeps the unique
   * constraint satisfied), unlinks Google, clears the password hash, and
   * revokes every refresh token.
   */
  async deleteAccount(authUser: AuthUser): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: authUser.id } });
    if (!user || user.deletedAt !== null) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.update({
      where: { id: authUser.id },
      data: {
        deletedAt: new Date(),
        email: `deleted-${authUser.id}@deleted.local`,
        googleId: null,
        passwordHash: null,
        avatarUrl: null,
      },
    });

    await this.tokenService.revokeAllForUser(authUser.id);
    await this.invalidateAuthCache(authUser.id);
    this.metrics.increment('users_deletions_total');
    this.logger.log(`User account soft-deleted: ${authUser.id}`);
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
