import { prisma } from '../../config/prisma.js';

// Google Agenda (fase 7): acesso ao banco.

export interface DadosConexao {
  businessId: string;
  userId: string;
  tipo: 'negocio' | 'profissional';
  professionalId: string | null;
  googleEmail: string;
  refreshTokenCifrado: string;
  calendarioId: string;
}

export const googleAgendaRepository = {
  usuario(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, businessId: true, role: true, professionalId: true, business: { select: { name: true, plan: true } } },
    });
  },

  profissionaisAtivos(businessId: string) {
    return prisma.professional.findMany({
      where: { businessId, active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' },
    });
  },

  profissionalDoNegocio(businessId: string, id: string) {
    return prisma.professional.findFirst({ where: { id, businessId }, select: { id: true } });
  },

  conexaoDoUsuario(userId: string) {
    return prisma.googleAgendaConexao.findUnique({ where: { userId } });
  },

  conexaoPorId(id: string) {
    return prisma.googleAgendaConexao.findUnique({ where: { id }, include: { business: { select: { name: true, plan: true } } } });
  },

  conexoesDoNegocio(businessId: string) {
    return prisma.googleAgendaConexao.findMany({ where: { businessId } });
  },

  /** Conexões com status gravado "ativa", com o plano do negócio para calcular a pausa. */
  conexoesAtivas(filtro: { id?: string; businessId?: string } = {}) {
    return prisma.googleAgendaConexao.findMany({
      where: { status: 'ativa', ...filtro },
      include: { business: { select: { name: true, plan: true } } },
    });
  },

  /** Reconectar a mesma conta troca o token e a agenda e recomeça os eventos. */
  async salvarConexao(d: DadosConexao) {
    return prisma.$transaction(async (tx) => {
      const antiga = await tx.googleAgendaConexao.findUnique({ where: { userId: d.userId }, select: { id: true } });
      if (antiga) await tx.googleAgendaConexao.delete({ where: { id: antiga.id } });
      return tx.googleAgendaConexao.create({ data: { ...d, status: 'ativa' } });
    });
  },

  atualizarConexao(id: string, patch: { professionalId?: string | null; status?: string; ultimoErro?: string | null; ultimaSyncEm?: Date }) {
    return prisma.googleAgendaConexao.update({ where: { id }, data: patch });
  },

  apagarConexao(id: string) {
    return prisma.googleAgendaConexao.delete({ where: { id } });
  },

  agendamentoPorId(id: string) {
    return prisma.appointment.findUnique({ where: { id }, select: { id: true, businessId: true } });
  },

  /** Agendamentos do negócio na janela (todas as profissionais: a troca de profissional precisa aparecer). */
  agendamentosDaJanela(businessId: string, j: { de: Date; ate: Date; appointmentId?: string }) {
    return prisma.appointment.findMany({
      where: { businessId, date: { gte: j.de, lte: j.ate }, ...(j.appointmentId ? { id: j.appointmentId } : {}) },
      select: {
        id: true, businessId: true, professionalId: true, status: true, updatedAt: true, date: true, time: true,
        client: { select: { name: true } }, service: { select: { name: true, durationMinutes: true } },
        professional: { select: { name: true } },
      },
    });
  },

  eventosDaConexao(conexaoId: string) {
    return prisma.googleAgendaEvento.findMany({
      where: { conexaoId }, select: { appointmentId: true, googleEventId: true, versao: true },
    });
  },

  salvarEvento(d: { conexaoId: string; appointmentId: string; googleEventId: string; versao: Date }) {
    return prisma.googleAgendaEvento.upsert({
      where: { conexaoId_appointmentId: { conexaoId: d.conexaoId, appointmentId: d.appointmentId } },
      create: d,
      update: { googleEventId: d.googleEventId, versao: d.versao },
    });
  },

  apagarEvento(conexaoId: string, appointmentId: string) {
    return prisma.googleAgendaEvento.deleteMany({ where: { conexaoId, appointmentId } });
  },

  async substituirOcupado(conexaoId: string, ocupados: Array<{ inicio: Date; fim: Date }>) {
    await prisma.$transaction([
      prisma.googleAgendaOcupado.deleteMany({ where: { conexaoId } }),
      prisma.googleAgendaOcupado.createMany({ data: ocupados.map((o) => ({ conexaoId, inicio: o.inicio, fim: o.fim })) }),
    ]);
  },

  /** Ocupados das conexões do negócio que cruzam a janela, com o que decide se a conexão bloqueia. */
  ocupadosDoNegocio(businessId: string, de: Date, ate: Date) {
    return prisma.googleAgendaOcupado.findMany({
      where: { inicio: { lt: ate }, fim: { gt: de }, conexao: { businessId } },
      select: {
        inicio: true, fim: true,
        conexao: { select: { tipo: true, status: true, professionalId: true, business: { select: { plan: true } } } },
      },
    });
  },
};
