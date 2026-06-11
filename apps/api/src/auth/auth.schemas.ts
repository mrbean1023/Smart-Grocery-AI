import { z } from 'zod';

/**
 * Auth request schemas not covered by @smart-grocery/shared (which provides
 * registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema).
 */

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(32).max(512),
});
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

export const googleOauthSchema = z.object({
  idToken: z.string().min(16).max(8192),
});
export type GoogleOauthInput = z.infer<typeof googleOauthSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(16).max(512),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
