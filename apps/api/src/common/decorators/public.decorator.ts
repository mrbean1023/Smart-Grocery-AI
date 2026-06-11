import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route (or whole controller) as publicly accessible — the global
 * JwtAuthGuard skips authentication for handlers carrying this metadata.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
