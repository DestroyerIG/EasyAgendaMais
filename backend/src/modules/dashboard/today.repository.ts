import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';

/** Datas em YYYY-MM-DD (fuso do negócio); `@db.Date` é gravado como meia-noite UTC. */
const dia = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const hhmm = (d: Date) => d.toISOString().slice(11, 16);

// Mesmo include de GET /appointments, para serializar `proximas` com toAppointmentDto.
const INCLUDE = {
  client: { select: { name: true, phone: true } },
  professional: { select: { name: true } },
  service: { select: { name: true, price: true, durationMinutes: true } },
  comanda: { select: { id: true, status: true, number: true, totalCharged: true, depositApplied: true, enviadaRecepcaoEm: true } },
} as const;

export type AgendamentoDia = Prisma.AppointmentGetPayload<{ include: typeof INCLUDE }>;

export interface ProfissionalAtiva { id: string; name: string; almoco: { start: string; end: string } | null }
export interface AvaliacaoRecente { clientId: string; cliente: string; phone: string; nota: number; comentario: string | null; data: string }

export const todayRepository = {
  async negocio(businessId: string): Promise<{ ownerName: string; meta: number | null }> {
    const b = await prisma.business.findUnique({
      where: { id: businessId },
      select: { ownerName: true, settings: { select: { dailyRevenueGoal: true } } },
    });
    const meta = b?.settings?.dailyRevenueGoal;
    return { ownerName: b?.ownerName ?? '', meta: meta === null || meta === undefined ? null : Number(meta) };
  },

  async profissionaisAtivas(businessId: string): Promise<ProfissionalAtiva[]> {
    const rows = await prisma.professional.findMany({
      where: { businessId, active: true },
      select: { id: true, name: true, breakStart: true, breakEnd: true },
      orderBy: { name: 'asc' },
    });
    return rows.map((p) => ({
      id: p.id, name: p.name,
      almoco: p.breakStart && p.breakEnd ? { start: hhmm(p.breakStart), end: hhmm(p.breakEnd) } : null,
    }));
  },

  /** Agendamentos (qualquer status) das datas pedidas; o serviço filtra. */
  async agendamentosNasDatas(businessId: string, datas: string[]): Promise<AgendamentoDia[]> {
    return prisma.appointment.findMany({
      where: { businessId, date: { in: datas.map(dia) } },
      include: INCLUDE,
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
    });
  },

  async faturamentoPorDia(businessId: string, de: string, ate: string): Promise<Array<{ date: string; valor: number }>> {
    const rows = await prisma.earning.groupBy({
      by: ['date'],
      where: { businessId, date: { gte: dia(de), lte: dia(ate) } },
      _sum: { amount: true },
    });
    return rows.map((r) => ({ date: r.date.toISOString().slice(0, 10), valor: Number(r._sum.amount ?? 0) }));
  },

  /** Atendimentos do período com a receita (earning ou, sem ela, o preço do serviço — como no CRM). */
  async agendamentosDoMes(businessId: string, de: string, ate: string): Promise<Array<{ status: string; reminderSent: boolean; receita: number }>> {
    const rows = await prisma.appointment.findMany({
      where: { businessId, date: { gte: dia(de), lte: dia(ate) }, status: 'concluido', reminderSent: true },
      select: { status: true, reminderSent: true, service: { select: { price: true } }, earning: { select: { amount: true } } },
    });
    return rows.map((a) => ({
      status: a.status, reminderSent: a.reminderSent,
      receita: Number(a.earning?.amount ?? a.service.price),
    }));
  },

  async sinaisPendentes(businessId: string): Promise<Array<{ depositAmount: number; expiresAt: Date | null }>> {
    const rows = await prisma.appointment.findMany({
      where: { businessId, status: 'aguardando_pagamento' },
      select: { depositAmount: true, expiresAt: true },
    });
    return rows.map((a) => ({ depositAmount: Number(a.depositAmount ?? 0), expiresAt: a.expiresAt }));
  },

  async avaliacoesRecentes(businessId: string, desde: Date): Promise<AvaliacaoRecente[]> {
    const rows = await prisma.whatsappRating.findMany({
      where: { businessId, createdAt: { gte: desde } },
      orderBy: { createdAt: 'desc' },
      select: {
        rating: true, comment: true, createdAt: true,
        appointment: { select: { client: { select: { id: true, name: true, phone: true } } } },
      },
    });
    return rows.map((r) => ({
      clientId: r.appointment.client.id, cliente: r.appointment.client.name, phone: r.appointment.client.phone,
      nota: r.rating, comentario: r.comment ?? null, data: r.createdAt.toISOString(),
    }));
  },

  /** Clientes com agendamento de hoje em diante confirmado ou aguardando pagamento ainda válido. */
  async clientesComAgendamentoFuturo(businessId: string, hoje: string, agora: Date, clientId?: string): Promise<Set<string>> {
    const rows = await prisma.appointment.findMany({
      where: {
        businessId, date: { gte: dia(hoje) }, ...(clientId ? { clientId } : {}),
        OR: [{ status: 'confirmado' }, { status: 'aguardando_pagamento', expiresAt: { gt: agora } }],
      },
      select: { clientId: true },
      distinct: ['clientId'],
    });
    return new Set(rows.map((r) => r.clientId));
  },
};
