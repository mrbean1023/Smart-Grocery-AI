/**
 * The authenticated principal attached to `request.user` by JwtStrategy and
 * retrieved via `@CurrentUser()`. Feature modules depend on this exact shape.
 */
export interface AuthUser {
  id: string;
  email: string;
  role: 'USER' | 'ADMIN' | 'MODERATOR';
  tier: 'FREE' | 'PREMIUM';
}

/** JWT access-token payload. */
export interface JwtPayload {
  sub: string;
  email: string;
  role: AuthUser['role'];
}

/** Request metadata captured alongside refresh tokens. */
export interface RequestContext {
  userAgent?: string | null;
  ip?: string | null;
}

/** Redis cache key for the per-user AuthUser cache (60s TTL). */
export const authUserCacheKey = (userId: string): string => `authuser:${userId}`;
