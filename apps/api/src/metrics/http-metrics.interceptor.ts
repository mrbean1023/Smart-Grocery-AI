import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

/**
 * Records `sg_http_requests_total` (counter) and
 * `sg_http_request_duration_seconds` (histogram) labelled by
 * method / route / status for every HTTP request.
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const startedAt = process.hrtime.bigint();

    const record = (status: number): void => {
      const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
      const labels = {
        method: request.method,
        route: this.routeOf(request),
        status: String(status),
      };
      this.metrics.increment('http_requests_total', labels);
      this.metrics.observeHistogram('http_request_duration_seconds', durationSeconds, labels);
    };

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse<Response>();
          record(response.statusCode);
        },
        error: (error: unknown) => {
          record(error instanceof HttpException ? error.getStatus() : 500);
        },
      }),
    );
  }

  private routeOf(request: Request): string {
    const route = (request as Request & { route?: { path?: string } }).route;
    if (route?.path) {
      return `${request.baseUrl ?? ''}${route.path}`;
    }
    return (request.originalUrl ?? request.url).split('?')[0];
  }
}
