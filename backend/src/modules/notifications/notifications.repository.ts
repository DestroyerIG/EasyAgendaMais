import { prisma } from '../../config/prisma.js';
import type { NotifyInput, NotificationType } from './notifications.types.js';

const DEFAULT_LIMIT = 20;

export const notificationsRepository = {
  async create(businessId: string, input: NotifyInput) {
    return prisma.notification.create({
      data: {
        businessId,
        type: input.type,
        title: input.title,
        description: input.description,
        link: input.link,
      },
    });
  },

  async findByBusiness(businessId: string, limit = DEFAULT_LIMIT) {
    return prisma.notification.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  },

  async countUnread(businessId: string): Promise<number> {
    return prisma.notification.count({ where: { businessId, read: false } });
  },

  async markRead(id: string, businessId: string): Promise<boolean> {
    const result = await prisma.notification.updateMany({
      where: { id, businessId },
      data: { read: true },
    });
    return result.count > 0;
  },

  async markAllRead(businessId: string): Promise<number> {
    const result = await prisma.notification.updateMany({
      where: { businessId, read: false },
      data: { read: true },
    });
    return result.count;
  },
};

export type { NotificationType };
