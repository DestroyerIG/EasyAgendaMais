import type { WhatsappAvatar } from '@prisma/client';
import { prisma } from '../../config/prisma.js';

export type AvatarRow = WhatsappAvatar;

export const avatarRepository = {
  buscar(businessId: string, phoneKeys: string[]): Promise<AvatarRow[]> {
    return prisma.whatsappAvatar.findMany({ where: { businessId, phoneKey: { in: phoneKeys } } });
  },

  async gravar(businessId: string, phoneKey: string, url: string | null, fetchedAt: Date): Promise<void> {
    await prisma.whatsappAvatar.upsert({
      where: { businessId_phoneKey: { businessId, phoneKey } },
      create: { businessId, phoneKey, url, fetchedAt },
      update: { url, fetchedAt },
    });
  },
};
