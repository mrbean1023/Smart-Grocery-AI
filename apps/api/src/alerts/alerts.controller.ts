import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import {
  createPriceWatchSchema,
  upsertAlertSchema,
  type CreatePriceWatchInput,
  type UpsertAlertInput,
} from './alerts.schemas';
import { AlertsService, AlertSettingDto, PriceWatchDto } from './alerts.service';

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  getSettings(@CurrentUser() user: AuthUser): Promise<AlertSettingDto[]> {
    return this.alerts.getSettings(user.id);
  }

  @Put()
  upsert(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(upsertAlertSchema)) body: UpsertAlertInput,
  ): Promise<AlertSettingDto> {
    return this.alerts.upsert(user, body);
  }
}

@Controller('price-watches')
export class PriceWatchesController {
  constructor(private readonly alerts: AlertsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createPriceWatchSchema)) body: CreatePriceWatchInput,
  ): Promise<PriceWatchDto> {
    return this.alerts.createPriceWatch(user.id, body.productId, body.targetPriceCents);
  }

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<PriceWatchDto[]> {
    return this.alerts.listPriceWatches(user.id);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{ deleted: true }> {
    return this.alerts.deletePriceWatch(user.id, id);
  }
}
