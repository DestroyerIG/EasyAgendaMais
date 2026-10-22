import { prisma } from '../../config/prisma.js';

export interface VagaLiberada {
  data: string; // YYYY-MM-DD
  hora: string; // HH:MM (relógio do negócio)
  serviceId: string;
  professionalId: string;
  duracao: number;
  profissional: string;
  /** Cliente que liberou a vaga (não recebe a oferta). */
  clientId: string;
}

export interface EntradaEspera {
  id: string;
  clientId: string;
  nome: string;
  phone: string;
  serviceId: string;
  professionalId: string | null;
  desiredDate: string | null;
  period: string;
  duracaoServico: number;
  consentimentoRevogado: boolean;
}

export interface AgendamentoAvaliacao {
  clientId: string;
  nome: string;
  phone: string;
  servico: string;
}

/** Mesmo critério de rotinasRepository.agendamentosDoDia: o consentimento mais recente negado ou revogado. */
const revogado = (c: { granted: boolean; revokedAt: Date | null } | undefined): boolean =>
  !!c && (!c.granted || !!c.revokedAt);

const OFERTA_VENCE_MS = 24 * 3_600_000;

/** Aguardando, ou oferecida há mais de 24h (a vaga anterior ficou com outra pessoa ou não foi usada). */
const podeReceberOferta = (agora: Date) => ({
  OR: [
    { status: 'aguardando' },
    { status: 'oferecida', offeredAt: { lt: new Date(agora.getTime() - OFERTA_VENCE_MS) } },
  ],
});

export const gatilhosRepository = {
  async vaga(businessId: string, appointmentId: string): Promise<VagaLiberada | null> {
    const a = await prisma.appointment.findFirst({
      where: { id: appointmentId, businessId },
      select: {
        date: true, time: true, serviceId: true, professionalId: true, clientId: true,
        service: { select: { durationMinutes: true } }, professional: { select: { name: true } },
      },
    });
    if (!a) return null;
    return {
      data: a.date.toISOString().slice(0, 10), hora: a.time.toISOString().slice(11, 16),
      serviceId: a.serviceId, professionalId: a.professionalId,
      duracao: a.service.durationMinutes, profissional: a.professional.name, clientId: a.clientId,
    };
  },

  async negocio(businessId: string): Promise<{ nome: string; slug: string | null }> {
    const b = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true, slug: true } });
    return { nome: b?.name ?? '', slug: b?.slug ?? null };
  },

  async nomeServico(businessId: string, serviceId: string): Promise<string> {
    const s = await prisma.service.findFirst({ where: { id: serviceId, businessId }, select: { name: true } });
    return s?.name ?? '';
  },

  /**
   * Quem pode receber a oferta: `aguardando` e `oferecida` há mais de 24h sem ter ficado com a vaga.
   * Ordem: aguardando primeiro (por entrada na lista), depois as ofertas mais antigas.
   */
  async entradasCandidatas(businessId: string, agora: Date): Promise<EntradaEspera[]> {
    const rows = await prisma.waitlistEntry.findMany({
      where: { businessId, ...podeReceberOferta(agora) },
      orderBy: { createdAt: 'asc' },
      include: {
        client: {
          select: {
            name: true, phone: true,
            consents: {
              where: { kind: 'whatsapp_lembretes' }, orderBy: { grantedAt: 'desc' }, take: 1,
              select: { granted: true, revokedAt: true },
            },
          },
        },
        service: { select: { durationMinutes: true } },
      },
    });
    const chave = (r: { status: string; offeredAt: Date | null; createdAt: Date }) =>
      r.status === 'aguardando' ? [0, r.createdAt.getTime()] : [1, r.offeredAt?.getTime() ?? 0];
    const ordenadas = [...rows].sort((x, y) => {
      const [a1, a2] = chave(x); const [b1, b2] = chave(y);
      return a1 - b1 || a2 - b2;
    });
    return ordenadas.map((r) => ({
      id: r.id, clientId: r.clientId, nome: r.client.name, phone: r.client.phone,
      serviceId: r.serviceId, professionalId: r.professionalId,
      desiredDate: r.desiredDate ? r.desiredDate.toISOString().slice(0, 10) : null,
      period: r.period, duracaoServico: r.service.durationMinutes,
      consentimentoRevogado: revogado(r.client.consents?.[0]),
    }));
  },

  /** Mesmo valor de waitlistService.offer ('oferecida'); só se ainda puder receber (compare-and-set). */
  async marcarOferecida(id: string, businessId: string, quando: Date): Promise<boolean> {
    const r = await prisma.waitlistEntry.updateMany({
      where: { id, businessId, ...podeReceberOferta(quando) }, data: { status: 'oferecida', offeredAt: quando },
    });
    return r.count > 0;
  },

  async desfazerOferta(id: string, businessId: string): Promise<void> {
    await prisma.waitlistEntry.updateMany({
      where: { id, businessId, status: 'oferecida' }, data: { status: 'aguardando', offeredAt: null },
    });
  },

  async temAvaliacao(appointmentId: string): Promise<boolean> {
    return (await prisma.whatsappRating.count({ where: { appointmentId } })) > 0;
  },

  async agendamentoParaAvaliacao(businessId: string, appointmentId: string): Promise<AgendamentoAvaliacao | null> {
    const a = await prisma.appointment.findFirst({
      where: { id: appointmentId, businessId },
      select: { clientId: true, client: { select: { name: true, phone: true } }, service: { select: { name: true } } },
    });
    return a ? { clientId: a.clientId, nome: a.client.name, phone: a.client.phone, servico: a.service.name } : null;
  },
};
