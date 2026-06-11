import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ReceiptStatus } from '@prisma/client';
import type { ReceiptUpload } from '@prisma/client';
import type { Paginated } from '@smart-grocery/shared';
import type { AuthUser } from '../auth/types';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import type { ReceiptJobData } from './receipts.processor';

export interface ReceiptDto {
  id: string;
  status: ReceiptStatus;
  storeCode: string | null;
  receiptDate: string | null;
  totalCents: number | null;
  parsedItems: unknown;
  failureReason: string | null;
  imageUrl: string | null;
  createdAt: string;
}

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);

@Injectable()
export class ReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @InjectQueue('receipt-processing') private readonly receiptQueue: Queue<ReceiptJobData>,
  ) {}

  async uploadReceipt(user: AuthUser, file: Express.Multer.File): Promise<ReceiptDto> {
    if (!ALLOWED_IMAGE_MIME.has(file.mimetype)) {
      throw new BadRequestException('Only JPEG, PNG, WEBP or HEIC images are supported');
    }

    const key = this.storage.buildKey(user.id, 'receipts', file.originalname);
    await this.storage.upload({ buffer: file.buffer, key, contentType: file.mimetype });

    const receipt = await this.prisma.receiptUpload.create({
      data: { userId: user.id, fileKey: key, status: ReceiptStatus.UPLOADED },
    });

    await this.receiptQueue.add(
      'process-receipt',
      { receiptId: receipt.id },
      { attempts: 3, backoff: { type: 'exponential', delay: 10_000 }, removeOnComplete: true },
    );

    return this.toDto(receipt);
  }

  async listMine(user: AuthUser, page: number, pageSize: number): Promise<Paginated<ReceiptDto>> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.receiptUpload.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.receiptUpload.count({ where: { userId: user.id } }),
    ]);
    const dtos = await Promise.all(items.map((r) => this.toDto(r, true)));
    return {
      items: dtos,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async getOwn(user: AuthUser, id: string): Promise<ReceiptDto> {
    const receipt = await this.prisma.receiptUpload.findFirst({
      where: { id, userId: user.id },
    });
    if (!receipt) {
      throw new NotFoundException(`Receipt ${id} not found`);
    }
    return this.toDto(receipt, true);
  }

  private async toDto(receipt: ReceiptUpload, withUrl = false): Promise<ReceiptDto> {
    let imageUrl: string | null = null;
    if (withUrl) {
      try {
        imageUrl = await this.storage.getSignedUrl(receipt.fileKey);
      } catch {
        imageUrl = null;
      }
    }
    return {
      id: receipt.id,
      status: receipt.status,
      storeCode: receipt.storeCode,
      receiptDate: receipt.receiptDate ? receipt.receiptDate.toISOString() : null,
      totalCents: receipt.totalCents,
      parsedItems: receipt.parsedItems,
      failureReason: receipt.failureReason,
      imageUrl,
      createdAt: receipt.createdAt.toISOString(),
    };
  }
}
