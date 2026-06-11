import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsModule } from '../notifications/notifications.module';
import { AlertsController, PriceWatchesController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { AlertScanService } from './alert-scan.service';
import { AlertsScheduler, ALERTS_QUEUE } from './alerts.scheduler';
import { AlertsProcessor } from './alerts.processor';

@Module({
  imports: [BullModule.registerQueue({ name: ALERTS_QUEUE }), NotificationsModule],
  controllers: [AlertsController, PriceWatchesController],
  providers: [AlertsService, AlertScanService, AlertsScheduler, AlertsProcessor],
  exports: [AlertsService],
})
export class AlertsModule {}
