import { prisma } from '../../config/prisma.js';
import type { Prisma } from '@prisma/client';
import type { Periodo } from './periodo.js';

const data = (d: string) => new Date(`${d}T00:00:00Z`);
const hhmm = (t: Date | null) => (t ? t.toISOString().substring(11, 16) : null);

export const reportsRepository = {
  comandasFechadas(businessId: string, intervalo: { gte: Date; lt: Date }) {
    return prisma.comanda.findMany({
      where: { businessId, status: 'fechada', closedAt: intervalo },
      select: {
        id: true, professionalId: true, clientId: true, closedAt: true,
        servicesTotal: true, productsTotal: true, discountAmount: true, tipAmount: true,
        items: { select: { kind: true, commissionAmount: true, valorCoberto: true } },
        appointment: { select: { id: true } },
      },
    });
  },

  async profissionais(businessId: string, idsExtras: string[] = []) {
    const lista = await prisma.professional.findMany({
      where: { businessId, OR: [{ active: true }, { id: { in: idsExtras } }] },
      select: { id: true, name: true, photo: true, active: true, cnpj: true, especialidade: true, breakStart: true, breakEnd: true },
      orderBy: { name: 'asc' },
    });
    return lista.map((p) => ({ ...p, breakStart: hhmm(p.breakStart), breakEnd: hhmm(p.breakEnd) }));
  },

  adiantamentos(businessId: string, filtro: { professionalId?: string; ate?: string }) {
    return prisma.adiantamento.findMany({
      where: {
        businessId,
        ...(filtro.professionalId && { professionalId: filtro.professionalId }),
        ...(filtro.ate && { data: { lte: data(filtro.ate) } }),
      },
      orderBy: [{ data: 'desc' }, { createdAt: 'desc' }],
    });
  },

  criarAdiantamento(businessId: string, userId: string, d: { professionalId: string; valor: number; data: string; descricao: string | null }) {
    return prisma.adiantamento.create({
      data: { businessId, createdBy: userId, professionalId: d.professionalId, valor: d.valor, data: data(d.data), descricao: d.descricao },
    });
  },

  adiantamento(businessId: string, id: string) {
    return prisma.adiantamento.findFirst({ where: { id, businessId } });
  },

  async excluirAdiantamentoAberto(businessId: string, id: string): Promise<boolean> {
    const r = await prisma.adiantamento.deleteMany({ where: { id, businessId, valorAbatido: 0 } });
    return r.count === 1;
  },

  professional(businessId: string, id: string) {
    return prisma.professional.findFirst({ where: { id, businessId }, select: { id: true, name: true } });
  },

  repasses(businessId: string, p: Periodo) {
    return prisma.repasse.findMany({ where: { businessId, periodoInicio: data(p.inicio), periodoFim: data(p.fim) } });
  },

  repasse(businessId: string, id: string) {
    return prisma.repasse.findFirst({ where: { id, businessId }, include: { abatimentos: true } });
  },

  repassePorPeriodo(businessId: string, professionalId: string, p: Periodo) {
    return prisma.repasse.findUnique({
      where: {
        businessId_professionalId_periodoInicio_periodoFim: {
          businessId, professionalId, periodoInicio: data(p.inicio), periodoFim: data(p.fim),
        },
      },
    });
  },

  transacao<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
    return prisma.$transaction(fn);
  },

  async modeloRepasse(businessId: string): Promise<string> {
    const s = await prisma.businessSettings.findUnique({ where: { businessId }, select: { modeloRepasse: true } });
    return s?.modeloRepasse ?? 'comissao';
  },

  async salvarModeloRepasse(businessId: string, modelo: string) {
    await prisma.businessSettings.upsert({
      where: { businessId }, create: { businessId, modeloRepasse: modelo }, update: { modeloRepasse: modelo },
    });
  },

  async negocio(businessId: string) {
    const b = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true, cpfCnpj: true } });
    return { nome: b?.name ?? '', cpfCnpj: b?.cpfCnpj ?? null };
  },

  // Agendamentos com data no período (para origem, faltas e ocupação).
  agendamentos(businessId: string, p: Periodo) {
    return prisma.appointment.findMany({
      where: { businessId, date: { gte: data(p.inicio), lte: data(p.fim) } },
      select: {
        id: true, clientId: true, professionalId: true, date: true, time: true, status: true, source: true, createdAt: true,
        service: { select: { durationMinutes: true } },
      },
    });
  },

  // Envios de Hora de voltar e campanhas que chegaram às clientes (atribuição de origem).
  enviosDeRetorno(businessId: string, clientIds: string[], intervalo: { gte: Date; lt: Date }) {
    if (!clientIds.length) return Promise.resolve([]);
    return prisma.whatsappEnvio.findMany({
      where: { businessId, clientId: { in: clientIds }, origin: { in: ['retorno', 'campanha'] }, status: 'enviado', sentAt: intervalo },
      select: { clientId: true, sentAt: true },
    });
  },

  // Datas das visitas concluídas até `ate` das clientes informadas (retorno no ciclo).
  visitasConcluidas(businessId: string, clientIds: string[], ate: string) {
    if (!clientIds.length) return Promise.resolve([]);
    return prisma.appointment.findMany({
      where: { businessId, clientId: { in: clientIds }, status: 'concluido', date: { lte: data(ate) } },
      select: { clientId: true, date: true },
      orderBy: { date: 'asc' },
    });
  },

  async configuracao(businessId: string) {
    const [s, comSinal] = await Promise.all([
      prisma.businessSettings.findUnique({
        where: { businessId },
        select: { dailyRevenueGoal: true, whatsappReminders: true },
      }),
      prisma.service.count({ where: { businessId, active: true, depositPercentage: { gt: 0 } } }),
    ]);
    return {
      metaDiaria: s?.dailyRevenueGoal == null ? null : Number(s.dailyRevenueGoal),
      lembretes: s?.whatsappReminders ?? true,
      sinalPix: comSinal > 0,
    };
  },
};
