import { Controller, Get } from '@nestjs/common';
import type { StoreDto } from '@smart-grocery/shared';
import { Public } from '../common/decorators/public.decorator';
import { StoresService } from './stores.service';

@Controller('stores')
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @Public()
  @Get()
  async list(): Promise<StoreDto[]> {
    return this.storesService.getActiveStores();
  }
}
