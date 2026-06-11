import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const MAX_CONNECT_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 500;

/**
 * Application-wide Prisma client. Connects eagerly on module init with
 * exponential-backoff retry so transient database hiccups during deploys do
 * not kill the process before it ever becomes healthy.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt++) {
      try {
        await this.$connect();
        this.logger.log('Connected to PostgreSQL');
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (attempt === MAX_CONNECT_ATTEMPTS) {
          this.logger.error(
            `Failed to connect to PostgreSQL after ${MAX_CONNECT_ATTEMPTS} attempts: ${message}`,
          );
          throw error;
        }
        const backoffMs = BASE_BACKOFF_MS * 2 ** (attempt - 1);
        this.logger.warn(
          `PostgreSQL connection attempt ${attempt}/${MAX_CONNECT_ATTEMPTS} failed (${message}); retrying in ${backoffMs}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Disconnected from PostgreSQL');
  }
}
