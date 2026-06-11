import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AlertType, Notification, Prisma } from '@prisma/client';
import type { NotificationDto, Paginated } from '@smart-grocery/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MailService, alertEmail } from '../mail/mail.service';

export type NotificationChannel = 'in_app' | 'email' | 'both';

export interface ListNotificationsOptions {
  unreadOnly: boolean;
  page: number;
  pageSize: number;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /**
   * Create an in-app notification row and, when the channel includes email and
   * an address is provided, also deliver it by email. Email failures are
   * logged but never fail the notification itself.
   */
  async notify(
    userId: string,
    type: AlertType,
    title: string,
    body: string,
    data?: Record<string, unknown>,
    channel: NotificationChannel = 'in_app',
    email?: string,
  ): Promise<NotificationDto> {
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        type,
        title,
        body,
        ...(data !== undefined ? { data: data as Prisma.InputJsonValue } : {}),
      },
    });

    if ((channel === 'email' || channel === 'both') && email) {
      try {
        const { subject, html } = alertEmail(title, body);
        await this.mail.send({ to: email, subject, html });
      } catch (err) {
        this.logger.error(
          `Failed to send alert email to ${email}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return this.toDto(notification);
  }

  async list(userId: string, opts: ListNotificationsOptions): Promise<Paginated<NotificationDto>> {
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(opts.unreadOnly ? { readAt: null } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
      }),
    ]);
    return {
      items: rows.map((n) => this.toDto(n)),
      total,
      page: opts.page,
      pageSize: opts.pageSize,
      totalPages: Math.max(1, Math.ceil(total / opts.pageSize)),
    };
  }

  async markRead(userId: string, id: string): Promise<NotificationDto> {
    const result = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      // Either it does not exist / is not owned, or it was already read.
      const existing = await this.prisma.notification.findFirst({ where: { id, userId } });
      if (!existing) throw new NotFoundException('Notification not found');
      return this.toDto(existing);
    }
    const updated = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!updated) throw new NotFoundException('Notification not found');
    return this.toDto(updated);
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({ where: { userId, readAt: null } });
    return { count };
  }

  private toDto(n: Notification): NotificationDto {
    return {
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      data: (n.data as Record<string, unknown> | null) ?? null,
      readAt: n.readAt ? n.readAt.toISOString() : null,
      createdAt: n.createdAt.toISOString(),
    };
  }
}
