import { SetMetadata } from '@nestjs/common';
import type { AuthUser } from '../../auth/types';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to users holding one of the given roles.
 * Apply together with the (global) JwtAuthGuard and the RolesGuard:
 *
 *   @Roles('ADMIN')
 *   @UseGuards(RolesGuard)
 */
export const Roles = (...roles: Array<AuthUser['role']>) => SetMetadata(ROLES_KEY, roles);
