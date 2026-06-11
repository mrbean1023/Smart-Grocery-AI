import { Controller, Get } from '@nestjs/common';
import type { AnalyticsSummary } from '@smart-grocery/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/types';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('summary')
  summary(@CurrentUser() user: AuthUser): Promise<AnalyticsSummary> {
    return this.analytics.getSummary(user.id);
  }
}
