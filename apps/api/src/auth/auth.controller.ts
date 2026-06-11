import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  type AuthResponse,
  type AuthTokens,
  type LoginInput,
  type RegisterInput,
} from '@smart-grocery/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  googleOauthSchema,
  refreshTokenSchema,
  verifyEmailSchema,
  type GoogleOauthInput,
  type RefreshTokenInput,
  type VerifyEmailInput,
} from './auth.schemas';
import { AuthService } from './auth.service';
import type { AuthUser, RequestContext } from './types';

type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

const STRICT_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle(STRICT_THROTTLE)
  @Post('register')
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Req() req: Request,
  ): Promise<AuthResponse> {
    return this.authService.register(body, this.contextOf(req));
  }

  @Public()
  @Throttle(STRICT_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
  ): Promise<AuthResponse> {
    return this.authService.login(body, this.contextOf(req));
  }

  @Public()
  @Throttle(STRICT_THROTTLE)
  @HttpCode(HttpStatus.OK)
  @Post('oauth/google')
  async googleOauth(
    @Body(new ZodValidationPipe(googleOauthSchema)) body: GoogleOauthInput,
    @Req() req: Request,
  ): Promise<AuthResponse> {
    return this.authService.loginWithGoogle(body.idToken, this.contextOf(req));
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @Body(new ZodValidationPipe(refreshTokenSchema)) body: RefreshTokenInput,
    @Req() req: Request,
  ): Promise<AuthTokens> {
    return this.authService.refresh(body.refreshToken, this.contextOf(req));
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(
    @Body(new ZodValidationPipe(refreshTokenSchema)) body: RefreshTokenInput,
  ): Promise<void> {
    await this.authService.logout(body.refreshToken);
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('verify-email')
  async verifyEmail(
    @Body(new ZodValidationPipe(verifyEmailSchema)) body: VerifyEmailInput,
  ): Promise<void> {
    await this.authService.verifyEmail(body.token);
  }

  /** Authenticated — global JwtAuthGuard applies (no @Public here). */
  @Throttle(STRICT_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('resend-verification')
  async resendVerification(@CurrentUser() user: AuthUser): Promise<void> {
    await this.authService.resendVerification(user);
  }

  @Public()
  @Throttle(STRICT_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('forgot-password')
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput,
  ): Promise<void> {
    await this.authService.forgotPassword(body.email);
  }

  @Public()
  @Throttle(STRICT_THROTTLE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('reset-password')
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput,
  ): Promise<void> {
    await this.authService.resetPassword(body.token, body.password);
  }

  private contextOf(req: Request): RequestContext {
    const userAgentHeader = req.headers['user-agent'];
    return {
      userAgent: typeof userAgentHeader === 'string' ? userAgentHeader.slice(0, 512) : null,
      ip: req.ip ?? null,
    };
  }
}
