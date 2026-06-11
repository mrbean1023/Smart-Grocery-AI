import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../auth/types';
import { BillingService, SubscriptionSummary } from './billing.service';
import { QuotaService, UsageEntry } from './quota.service';

const checkoutSchema = z.object({
  plan: z.enum(['monthly', 'yearly']),
});
type CheckoutInput = z.infer<typeof checkoutSchema>;

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly quotaService: QuotaService,
  ) {}

  @Get('subscription')
  async subscription(@CurrentUser() user: AuthUser): Promise<SubscriptionSummary> {
    return this.billingService.getSubscription(user);
  }

  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  async checkout(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(checkoutSchema)) body: CheckoutInput,
  ): Promise<{ url: string }> {
    return this.billingService.createCheckoutSession(user, body.plan);
  }

  @Post('portal')
  @HttpCode(HttpStatus.OK)
  async portal(@CurrentUser() user: AuthUser): Promise<{ url: string }> {
    return this.billingService.createPortalSession(user);
  }

  /**
   * Stripe webhook — requires the raw request body (NestFactory is created
   * with `rawBody: true` in main.ts) for signature verification.
   */
  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ): Promise<{ received: boolean }> {
    if (!req.rawBody) {
      throw new BadRequestException('Missing raw request body');
    }
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }
    return this.billingService.handleWebhook(req.rawBody, signature);
  }

  @Get('usage')
  async usage(@CurrentUser() user: AuthUser): Promise<UsageEntry[]> {
    return this.quotaService.getUsage(user);
  }
}
