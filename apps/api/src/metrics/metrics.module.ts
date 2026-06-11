import { Global, Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { MetricsService } from './metrics.service';

/**
 * Exposes GET /metrics (excluded from the global `v1` prefix in main.ts) with
 * Node.js default metrics plus all lazily-registered `sg_*` application
 * metrics from MetricsService.
 */
@Global()
@Module({
  imports: [
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: {
        enabled: process.env.PROMETHEUS_ENABLED !== 'false',
      },
    }),
  ],
  providers: [MetricsService, HttpMetricsInterceptor],
  exports: [MetricsService, HttpMetricsInterceptor],
})
export class MetricsModule {}
