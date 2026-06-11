import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionStatus, SubscriptionTier } from '@prisma/client';
import Redis from 'ioredis';
import Stripe from 'stripe';
import { authUserCacheKey, AuthUser } from '../auth/types';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';

export type BillingPlan = 'monthly' | 'yearly';

export interface SubscriptionSummary {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

const STRIPE_STATUS_MAP: Record<string, SubscriptionStatus> = {
  active: 'ACTIVE',
  trialing: 'TRIALING',
  past_due: 'PAST_DUE',
  unpaid: 'PAST_DUE',
  canceled: 'CANCELED',
  incomplete: 'INCOMPLETE',
  incomplete_expired: 'INCOMPLETE',
  paused: 'CANCELED',
};

/** Stripe statuses that keep the user on PREMIUM (past_due gets a grace period). */
const PREMIUM_STRIPE_STATUSES = new Set(['active', 'trialing', 'past_due']);

/**
 * Stripe billing integration. The Stripe client is only instantiated when
 * STRIPE_SECRET_KEY is configured; otherwise billing endpoints respond 503
 * with a clear message. Webhook processing is idempotent (pure upserts of
 * subscription state).
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly stripe: Stripe | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly metrics: MetricsService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    const secretKey = configService.get<string | undefined>('stripe.secretKey');
    this.stripe = secretKey ? new Stripe(secretKey) : null;
    if (!this.stripe) {
      this.logger.warn('STRIPE_SECRET_KEY not set — billing endpoints will return 503');
    }
  }

  private requireStripe(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableException(
        'Billing is not configured on this server (missing STRIPE_SECRET_KEY)',
      );
    }
    return this.stripe;
  }

  // ----------------------------------------------------------- subscription

  async getSubscription(user: AuthUser): Promise<SubscriptionSummary> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId: user.id },
    });
    if (!subscription) {
      return { tier: 'FREE', status: 'ACTIVE', currentPeriodEnd: null, cancelAtPeriodEnd: false };
    }
    return {
      tier: subscription.tier,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    };
  }

  // --------------------------------------------------------------- checkout

  async createCheckoutSession(user: AuthUser, plan: BillingPlan): Promise<{ url: string }> {
    const stripe = this.requireStripe();
    const priceId =
      plan === 'monthly'
        ? this.configService.get<string | undefined>('stripe.priceMonthly')
        : this.configService.get<string | undefined>('stripe.priceYearly');
    if (!priceId) {
      throw new ServiceUnavailableException(
        `Billing price for the ${plan} plan is not configured`,
      );
    }

    const customerId = await this.getOrCreateCustomer(user, stripe);
    const webUrl = this.configService.get<string>('webUrl', 'http://localhost:3000');

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${webUrl}/settings?billing=success`,
      cancel_url: `${webUrl}/settings?billing=cancelled`,
      client_reference_id: user.id,
      metadata: { userId: user.id },
      subscription_data: { metadata: { userId: user.id } },
    });

    if (!session.url) {
      throw new InternalServerErrorException('Stripe did not return a checkout URL');
    }
    this.metrics.increment('billing_checkout_sessions_total', { plan });
    return { url: session.url };
  }

  async createPortalSession(user: AuthUser): Promise<{ url: string }> {
    const stripe = this.requireStripe();
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId: user.id },
    });
    if (!subscription?.stripeCustomerId) {
      throw new BadRequestException('No billing account exists for this user yet');
    }

    const webUrl = this.configService.get<string>('webUrl', 'http://localhost:3000');
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${webUrl}/settings`,
    });
    return { url: session.url };
  }

  private async getOrCreateCustomer(user: AuthUser, stripe: Stripe): Promise<string> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { userId: user.id },
    });
    if (subscription?.stripeCustomerId) {
      return subscription.stripeCustomerId;
    }

    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId: user.id },
    });

    await this.prisma.subscription.upsert({
      where: { userId: user.id },
      create: { userId: user.id, stripeCustomerId: customer.id },
      update: { stripeCustomerId: customer.id },
    });
    this.logger.log(`Created Stripe customer ${customer.id} for user ${user.id}`);
    return customer.id;
  }

  // ---------------------------------------------------------------- webhook

  async handleWebhook(rawBody: Buffer, signature: string): Promise<{ received: boolean }> {
    const stripe = this.requireStripe();
    const webhookSecret = this.configService.get<string | undefined>('stripe.webhookSecret');
    if (!webhookSecret) {
      throw new ServiceUnavailableException('Stripe webhook secret is not configured');
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Stripe webhook signature verification failed: ${message}`);
      throw new BadRequestException('Invalid Stripe webhook signature');
    }

    this.metrics.increment('stripe_webhooks_total', { type: event.type });

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId ?? session.client_reference_id ?? undefined;
        const subscriptionId =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id;
        if (subscriptionId) {
          const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
          await this.syncSubscription(stripeSubscription, userId);
        } else {
          this.logger.warn(
            `checkout.session.completed ${session.id} carried no subscription id — skipped`,
          );
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const stripeSubscription = event.data.object as Stripe.Subscription;
        await this.syncSubscription(stripeSubscription);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
        if (customerId) {
          await this.markPastDue(customerId);
        }
        break;
      }
      default:
        this.logger.debug(`Ignoring unhandled Stripe event type: ${event.type}`);
    }

    return { received: true };
  }

  /**
   * Syncs a Stripe subscription into the local Subscription row. Idempotent:
   * the same event applied twice converges to the same state.
   */
  private async syncSubscription(
    stripeSubscription: Stripe.Subscription,
    knownUserId?: string,
  ): Promise<void> {
    const customerId =
      typeof stripeSubscription.customer === 'string'
        ? stripeSubscription.customer
        : stripeSubscription.customer.id;
    const metadataUserId = stripeSubscription.metadata?.userId;

    const row = await this.findSubscriptionRow(
      stripeSubscription.id,
      customerId,
      knownUserId ?? metadataUserId,
    );
    if (!row) {
      this.logger.error(
        `No local subscription found for Stripe subscription ${stripeSubscription.id} (customer ${customerId})`,
      );
      return;
    }

    const status = STRIPE_STATUS_MAP[stripeSubscription.status] ?? 'INCOMPLETE';
    const tier: SubscriptionTier = PREMIUM_STRIPE_STATUSES.has(stripeSubscription.status)
      ? 'PREMIUM'
      : 'FREE';
    const currentPeriodEnd = stripeSubscription.current_period_end
      ? new Date(stripeSubscription.current_period_end * 1000)
      : null;

    await this.prisma.subscription.update({
      where: { id: row.id },
      data: {
        tier,
        status,
        stripeCustomerId: customerId,
        stripeSubscriptionId: stripeSubscription.id,
        stripePriceId: stripeSubscription.items.data[0]?.price?.id ?? null,
        currentPeriodEnd,
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
      },
    });

    await this.invalidateAuthCache(row.userId);
    this.logger.log(
      `Synced subscription for user ${row.userId}: tier=${tier} status=${status} (stripe ${stripeSubscription.status})`,
    );
  }

  private async findSubscriptionRow(
    stripeSubscriptionId: string,
    stripeCustomerId: string,
    userId?: string,
  ): Promise<{ id: string; userId: string } | null> {
    const bySubscription = await this.prisma.subscription.findUnique({
      where: { stripeSubscriptionId },
      select: { id: true, userId: true },
    });
    if (bySubscription) return bySubscription;

    const byCustomer = await this.prisma.subscription.findUnique({
      where: { stripeCustomerId },
      select: { id: true, userId: true },
    });
    if (byCustomer) return byCustomer;

    if (userId) {
      return this.prisma.subscription.findUnique({
        where: { userId },
        select: { id: true, userId: true },
      });
    }
    return null;
  }

  private async markPastDue(stripeCustomerId: string): Promise<void> {
    const row = await this.prisma.subscription.findUnique({
      where: { stripeCustomerId },
      select: { id: true, userId: true },
    });
    if (!row) {
      this.logger.warn(`invoice.payment_failed for unknown Stripe customer ${stripeCustomerId}`);
      return;
    }
    await this.prisma.subscription.update({
      where: { id: row.id },
      data: { status: 'PAST_DUE' },
    });
    await this.invalidateAuthCache(row.userId);
    this.logger.warn(`Payment failed — subscription for user ${row.userId} marked PAST_DUE`);
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
