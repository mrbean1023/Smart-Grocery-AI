import { Module } from '@nestjs/common';
import { HealthController, HealthzController } from './health.controller';

@Module({
  controllers: [HealthController, HealthzController],
})
export class HealthModule {}
