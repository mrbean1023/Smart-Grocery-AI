import {
  Controller,
  Get,
  Inject,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import Redis from 'ioredis';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';

const DEPENDENCY_TIMEOUT_MS = 2000;
const API_VERSION = process.env.npm_package_version ?? '1.0.0';

interface DependencyStatus {
  status: 'up' | 'down';
  latencyMs: number;
  error?: string;
}

/** Liveness + readiness under the global `v1` prefix. */
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Public()
  @Get()
  liveness(): { status: string; version: string; uptime: number } {
    return {
      status: 'ok',
      version: API_VERSION,
      uptime: Math.round(process.uptime()),
    };
  }

  @Public()
  @Get('ready')
  async readiness(): Promise<{ status: string; dependencies: Record<string, DependencyStatus> }> {
    const [database, redis] = await Promise.all([
      this.check('database', async () => {
        await this.prisma.$queryRaw`SELECT 1`;
      }),
      this.check('redis', async () => {
        await this.redis.ping();
      }),
    ]);

    const dependencies = { database, redis };
    const healthy = Object.values(dependencies).every((d) => d.status === 'up');
    if (!healthy) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        message: 'One or more dependencies are unavailable',
        status: 'degraded',
        dependencies,
      });
    }
    return { status: 'ok', dependencies };
  }

  private async check(name: string, probe: () => Promise<void>): Promise<DependencyStatus> {
    const startedAt = Date.now();
    try {
      await Promise.race([
        probe(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`${name} check timed out after ${DEPENDENCY_TIMEOUT_MS}ms`)),
            DEPENDENCY_TIMEOUT_MS,
          ),
        ),
      ]);
      return { status: 'up', latencyMs: Date.now() - startedAt };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Readiness check failed for ${name}: ${message}`);
      return { status: 'down', latencyMs: Date.now() - startedAt, error: message };
    }
  }
}

/** Plain /healthz — excluded from the global prefix in main.ts (for k8s/LB probes). */
@Controller('healthz')
export class HealthzController {
  @Public()
  @Get()
  healthz(): string {
    return 'ok';
  }
}
