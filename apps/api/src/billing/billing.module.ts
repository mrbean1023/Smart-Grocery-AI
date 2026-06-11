import { Global, Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { QuotaService } from './quota.service';

/**
 * Global so feature modules (recipes, baskets, assistant, meal-plans, ...)
 * can inject QuotaService / BillingService without importing this module.
 */
@Global()
@Module({
  controllers: [BillingController],
  providers: [BillingService, QuotaService],
  exports: [BillingService, QuotaService],
})
export class BillingModule {}
