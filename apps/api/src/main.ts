import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as Sentry from '@sentry/node';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  // Initialize Sentry as early as possible (only when configured).
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV ?? 'development',
      tracesSampleRate: 0.1,
    });
    logger.log('Sentry error tracking enabled');
  }

  // rawBody is required for Stripe webhook signature verification.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('port', 4000);
  const webUrl = configService.get<string>('webUrl', 'http://localhost:3000');

  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());

  app.enableCors({
    origin: webUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  app.setGlobalPrefix('v1', { exclude: ['metrics', 'healthz'] });
  app.enableShutdownHooks();

  // Note: validation is per-route via ZodValidationPipe (no global pipe);
  // the global exception filter, guards, and interceptors are registered as
  // APP_* providers in AppModule so they participate in DI.

  await app.listen(port, '0.0.0.0');
  logger.log(`Smart Grocery AI API listening on port ${port} (prefix /v1, CORS origin ${webUrl})`);
}

bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');
  logger.error(
    `Fatal error during bootstrap: ${error instanceof Error ? error.message : String(error)}`,
    error instanceof Error ? error.stack : undefined,
  );
  process.exit(1);
});
