import { prisma } from '../../config/prisma.js';

export interface RespostaPendente {
  id: string; businessId: string; phoneKey: string; tipo: string; appointmentId: string; expiresAt: Date; createdAt: Date;
}

export const respostasRepository = {
  /** Uma espera por número: apaga as anteriores e cria a nova. */
  async registrar(a: {
    businessId: string; phoneKey: string; tipo: 'confirmacao' | 'avaliacao'; appointmentId: string; expiresAt: Date;
  }): Promise<void> {
    await prisma.$transaction([
      prisma.whatsappRespostaPendente.deleteMany({ where: { businessId: a.businessId, phoneKey: a.phoneKey } }),
      prisma.whatsappRespostaPendente.create({ data: a }),
    ]);
  },

  maisRecente(businessId: string, phoneKey: string, agora: Date): Promise<RespostaPendente | null> {
    return prisma.whatsappRespostaPendente.findFirst({
      where: { businessId, phoneKey, expiresAt: { gt: agora } },
      orderBy: { createdAt: 'desc' },
    });
  },

  async apagar(id: string): Promise<void> {
    await prisma.whatsappRespostaPendente.deleteMany({ where: { id } });
  },
};
