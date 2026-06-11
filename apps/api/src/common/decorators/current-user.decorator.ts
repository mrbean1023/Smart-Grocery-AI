import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../../auth/types';

/**
 * Injects the authenticated user (attached by JwtStrategy) into a handler:
 *
 *   @Get('me')
 *   me(@CurrentUser() user: AuthUser) { ... }
 *
 * Optionally pluck a single property: `@CurrentUser('id') userId: string`.
 */
export const CurrentUser = createParamDecorator(
  (property: keyof AuthUser | undefined, ctx: ExecutionContext): AuthUser | AuthUser[keyof AuthUser] => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = request.user as AuthUser;
    return property ? user?.[property] : user;
  },
);
