import { Global, Inject, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/** Injection token for the shared ioredis client: `@Inject(REDIS_CLIENT) redis: Redis`. */
export const REDIS_CLIENT = 'REDIS_CLIENT';

export interface RedisConnectionOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: Record<string, never>;
}

/**
 * Parses a redis:// or rediss:// URL into discrete connection options
 * (used for BullMQ, which wants an options object rather than a URL).
 */
export function redisConnectionFromUrl(url: string): RedisConnectionOptions {
  const parsed = new URL(url);
  const dbSegment = parsed.pathname.replace(/^\//, '');
  const db = Number.parseInt(dbSegment, 10);
  return {
    host: parsed.hostname || 'localhost',
    port: parsed.port ? Number.parseInt(parsed.port, 10) : 6379,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    db: Number.isFinite(db) ? db : 0,
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

const redisLogger = new Logger('Redis');

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Redis => {
        const url = configService.getOrThrow<string>('redisUrl');
        const client = new Redis(url, {
          lazyConnect: false,
          maxRetriesPerRequest: null,
          enableReadyCheck: true,
          retryStrategy: (attempt: number) => Math.min(attempt * 200, 5000),
        });

        client.on('connect', () => redisLogger.log('Connected to Redis'));
        client.on('ready', () => redisLogger.log('Redis client ready'));
        client.on('error', (error: Error) => {
          // Log only — ioredis reconnects automatically; never crash the app.
          redisLogger.error(`Redis connection error: ${error.message}`);
        });
        client.on('reconnecting', () => redisLogger.warn('Reconnecting to Redis...'));

        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    try {
      await this.redis.quit();
      redisLogger.log('Redis connection closed');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      redisLogger.warn(`Error while closing Redis connection: ${message}`);
    }
  }
}
