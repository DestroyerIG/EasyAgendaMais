import { prisma } from '../../config/prisma.js';

/** Saídas que não invalidam a espera de resposta. */
export const ORIGENS_QUE_NAO_INVALIDAM = ['confirmacao', 'avaliacao', 'lembrete', 'painel_evento'] as const;

export interface RespostaPendente {
  id: string; businessId: string; phoneKey: string; tipo: string; appointmentId: string; expiresAt: Date; createdAt: Date;
}

export const respostasRepository = {
  /** Uma espera por número e tipo: apaga a anterior do mesmo tipo e cria a nova (confirmação e avaliação convivem). */
  async registrar(a: {
    businessId: string; phoneKey: string; tipo: 'confirmacao' | 'avaliacao'; appointmentId: string; expiresAt: Date;
  }): Promise<void> {
    await prisma.$transaction([
      prisma.whatsappRespostaPendente.deleteMany({ where: { businessId: a.businessId, phoneKey: a.phoneKey, tipo: a.tipo } }),
      prisma.whatsappRespostaPendente.create({ data: a }),
    ]);
  },

  /** Esperas ainda válidas do número, da mais recente para a mais antiga. */
  pendentes(businessId: string, phoneKey: string, agora: Date): Promise<RespostaPendente[]> {
    return prisma.whatsappRespostaPendente.findMany({
      where: { businessId, phoneKey, expiresAt: { gt: agora } },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Houve saída para o número depois de `desde` que não seja de confirmação/avaliação
   * (essas convivem como esperas) nem nota interna do painel (não vai para a cliente)?
   */
  async houveSaidaDepois(businessId: string, phoneKey: string, desde: Date): Promise<boolean> {
    const n = await prisma.whatsappMessage.count({
      where: {
        businessId, phoneKey, direction: 'out', createdAt: { gt: desde },
        origin: { notIn: [...ORIGENS_QUE_NAO_INVALIDAM] },
      },
    });
    return n > 0;
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

  async salvarNota(a: { businessId: string; appointmentId: string; rating: number }): Promise<boolean> {
    // Nota gravada nunca é sobrescrita: se já existe (P2002), mantém a existente e devolve false.
    try {
      await prisma.whatsappRating.create({
        data: { businessId: a.businessId, appointmentId: a.appointmentId, rating: a.rating },
      });
      return true;
    } catch (e) {
      if ((e as { code?: string }).code !== 'P2002') throw e;
      return false;
    }
  },
};
