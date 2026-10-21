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

  async statusDoAgendamento(id: string, businessId: string): Promise<string | null> {
    const a = await prisma.appointment.findFirst({ where: { id, businessId }, select: { status: true } });
    return a?.status ?? null;
  },

  /** Grava a confirmação do cliente só se o agendamento ainda está confirmado. */
  async marcarConfirmadoPeloCliente(id: string, businessId: string, quando: Date): Promise<boolean> {
    const r = await prisma.appointment.updateMany({
      where: { id, businessId, status: 'confirmado' },
      data: { clientConfirmedAt: quando },
    });
    return r.count > 0;
  },

  async salvarNota(a: { businessId: string; appointmentId: string; rating: number }): Promise<void> {
    await prisma.whatsappRating.upsert({
      where: { appointmentId: a.appointmentId },
      create: { businessId: a.businessId, appointmentId: a.appointmentId, rating: a.rating },
      update: { rating: a.rating },
    });
  },
};
