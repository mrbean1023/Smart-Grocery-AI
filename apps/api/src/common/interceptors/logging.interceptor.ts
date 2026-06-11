import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { AuthUser } from '../../auth/types';

/**
 * Structured request logging: method, path, status, duration, userId (when
 * authenticated). 4xx logs at warn, 5xx at error, the rest at log level.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse<Response>();
          this.write(request, response.statusCode, Date.now() - startedAt);
        },
        error: (error: unknown) => {
          const status = error instanceof HttpException ? error.getStatus() : 500;
          this.write(request, status, Date.now() - startedAt);
        },
      }),
    );
  }

  private write(
    request: Request & { user?: AuthUser },
    status: number,
    durationMs: number,
  ): void {
    const path = request.originalUrl ?? request.url;
    const userSuffix = request.user?.id ? ` user=${request.user.id}` : '';
    const line = `${request.method} ${path} ${status} ${durationMs}ms${userSuffix}`;

    if (status >= 500) {
      this.logger.error(line);
    } else if (status >= 400) {
      this.logger.warn(line);
    } else {
      this.logger.log(line);
    }
  }
}
