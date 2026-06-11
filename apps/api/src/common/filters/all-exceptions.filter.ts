import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/node';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import type { AuthUser } from '../../auth/types';

interface ErrorBody {
  statusCode: number;
  message: string;
  error?: string;
  details?: unknown;
  [key: string]: unknown;
}

/**
 * Global catch-all exception filter.
 *  - HttpException → passthrough (object responses merged, custom codes kept)
 *  - Prisma P2002 → 409, P2025 → 404
 *  - ZodError → 400 with flattened issues
 *  - everything else → 500 (Sentry capture when configured; stack never leaks in prod)
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);
  private readonly isProduction: boolean;
  private readonly sentryEnabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.isProduction = configService.get<string>('nodeEnv', 'development') === 'production';
    this.sentryEnabled = Boolean(configService.get<string>('sentryDsn'));
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      this.logger.error(
        `Unhandled non-HTTP exception: ${this.describe(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
      return;
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { user?: AuthUser }>();

    const body = this.buildBody(exception);
    this.logException(exception, request, body);

    if (body.statusCode >= 500 && this.sentryEnabled) {
      Sentry.captureException(exception, {
        extra: {
          method: request.method,
          path: request.originalUrl ?? request.url,
          userId: request.user?.id,
        },
      });
    }

    response.status(body.statusCode).json(body);
  }

  private buildBody(exception: unknown): ErrorBody {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        return { statusCode: status, message: payload };
      }
      return { message: exception.message, ...(payload as Record<string, unknown>), statusCode: status } as ErrorBody;
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return {
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          message: 'A record with these unique values already exists',
        };
      }
      if (exception.code === 'P2025') {
        return {
          statusCode: HttpStatus.NOT_FOUND,
          error: 'Not Found',
          message: 'The requested record was not found',
        };
      }
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Internal Server Error',
        message: this.isProduction ? 'Internal server error' : `Database error (${exception.code})`,
      };
    }

    if (exception instanceof ZodError) {
      const flattened = exception.flatten();
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: 'Validation failed',
        details: { formErrors: flattened.formErrors, fieldErrors: flattened.fieldErrors },
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message:
        this.isProduction || !(exception instanceof Error)
          ? 'Internal server error'
          : exception.message,
    };
  }

  private logException(exception: unknown, request: Request, body: ErrorBody): void {
    const context = `${request.method} ${request.originalUrl ?? request.url} -> ${body.statusCode}`;
    if (body.statusCode >= 500) {
      this.logger.error(
        `${context}: ${this.describe(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(`${context}: ${body.message}`);
    }
  }

  private describe(exception: unknown): string {
    if (exception instanceof Error) return `${exception.name}: ${exception.message}`;
    return String(exception);
  }
}
