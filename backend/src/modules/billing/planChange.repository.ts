import { prisma } from '../../config/prisma.js';
import type { BillingPayment } from '@prisma/client';

const PENDENTES = ['pending', 'incomplete'];

export const planChangeRepository = {
  async contarProfissionaisAtivas(businessId: string): Promise<number> {
    return prisma.professional.count({ where: { businessId, active: true } });
  },

  async nomesProfissionaisAtivas(businessId: string): Promise<string[]> {
    const lista = await prisma.professional.findMany({
      where: { businessId, active: true },
      select: { name: true },
      orderBy: { name: 'asc' },
    });
    return lista.map((p) => p.name);
  },

  // Upgrade: o plano vale na hora e qualquer downgrade agendado deixa de existir.
  async aplicarPlano(businessId: string, plano: string): Promise<void> {
    await prisma.business.update({
      where: { id: businessId },
      data: {
        plan: plano,
        desiredPlan: plano,
        planoAgendado: null,
        planoAgendadoEm: null,
        subscriptionUpdatedAt: new Date(),
      },
    });
  },

  async agendarPlano(businessId: string, plano: string, em: Date): Promise<void> {
    await prisma.business.update({
      where: { id: businessId },
      data: { planoAgendado: plano, planoAgendadoEm: em, desiredPlan: plano },
    });
  },

  async limparPlanoAgendado(businessId: string, planoAtual: string): Promise<void> {
    await prisma.business.update({
      where: { id: businessId },
      data: { planoAgendado: null, planoAgendadoEm: null, desiredPlan: planoAtual },
    });
  },

  async upgradePendente(businessId: string): Promise<BillingPayment | null> {
    return prisma.billingPayment.findFirst({
      where: { businessId, tipo: 'upgrade', internalStatus: { in: PENDENTES } },
      orderBy: { createdAt: 'desc' },
    });
  },

  async marcarPagamento(id: string, internalStatus: string, externalStatus: string | null): Promise<void> {
    await prisma.billingPayment.update({
      where: { id },
      data: { internalStatus, ...(externalStatus ? { externalStatus } : {}) },
    });
  },

  async mensalidadePixAberta(businessId: string): Promise<BillingPayment | null> {
    return prisma.billingPayment.findFirst({
      where: { businessId, provider: 'asaas', tipo: 'mensalidade', internalStatus: { in: PENDENTES } },
      orderBy: { createdAt: 'desc' },
    });
  },

  async pagamentosPix(businessId: string): Promise<BillingPayment[]> {
    return prisma.billingPayment.findMany({
      where: { businessId, provider: 'asaas' },
      orderBy: [{ dueDate: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
  },

  // Downgrades Pix (e de quem não tem provedor) que venceram. Os do Stripe viram pelo
  // webhook da troca de fase do schedule.
  async downgradesVencidos(agora: Date) {
    return prisma.business.findMany({
      where: {
        active: true,
        planoAgendado: { not: null },
        planoAgendadoEm: { lte: agora },
        OR: [{ provider: null }, { provider: { not: 'stripe' } }],
      },
      select: { id: true, plan: true, planoAgendado: true },
    });
  },
};
