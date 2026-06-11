import type { StoreCode, UserProfile } from '@smart-grocery/shared';
import type { Subscription, User } from '@prisma/client';

export type UserWithSubscription = User & { subscription: Subscription | null };

/**
 * Maps a Prisma User (+ subscription) row to the shared UserProfile DTO.
 * Used by AuthService and UsersService — keep all profile shaping here.
 */
export function toUserProfile(user: UserWithSubscription): UserProfile {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    role: user.role,
    emailVerified: user.emailVerifiedAt !== null,
    tier: user.subscription?.tier ?? 'FREE',
    dietaryRestrictions: user.dietaryRestrictions,
    allergies: user.allergies,
    householdSize: user.householdSize,
    weeklyBudgetCents: user.weeklyBudgetCents,
    preferredStores: user.preferredStores as StoreCode[],
    createdAt: user.createdAt.toISOString(),
  };
}
