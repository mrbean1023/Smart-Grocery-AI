import { Injectable, NotFoundException } from '@nestjs/common';
import type { Store, StoreCode } from '@prisma/client';
import type { StoreDto } from '@smart-grocery/shared';
import { PrismaService } from '../prisma/prisma.service';

export function storeToDto(store: Store): StoreDto {
  return {
    id: store.id,
    code: store.code,
    name: store.name,
    logoUrl: store.logoUrl,
    supportsDelivery: store.supportsDelivery,
    deliveryFeeCents: store.deliveryFeeCents,
    freeDeliveryMinCents: store.freeDeliveryMinCents,
    minOrderCents: store.minOrderCents,
    qualityScore: store.qualityScore,
  };
}

@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveStores(): Promise<StoreDto[]> {
    const stores = await this.prisma.store.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    return stores.map(storeToDto);
  }

  async getByCode(code: StoreCode): Promise<Store> {
    const store = await this.prisma.store.findUnique({ where: { code } });
    if (!store) {
      throw new NotFoundException(`Store ${code} not found`);
    }
    return store;
  }
}
