import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route (or entire controller) as exempt from JwtAuthGuard.
 * Used only for POST /api/auth/login - every other route requires a valid token.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
