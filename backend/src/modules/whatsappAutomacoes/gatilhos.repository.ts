import { prisma } from '../../config/prisma.js';

export interface VagaLiberada {
  data: string; // YYYY-MM-DD
  hora: string; // HH:MM (relógio do negócio)
  serviceId: string;
  professionalId: string;
  duracao: number;
  profissional: string;
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
}

export interface AgendamentoAvaliacao {
  clientId: string;
  nome: string;
  phone: string;
  servico: string;
}

export const gatilhosRepository = {
  async vaga(businessId: string, appointmentId: string): Promise<VagaLiberada | null> {
    const a = await prisma.appointment.findFirst({
      where: { id: appointmentId, businessId },
      select: {
        date: true, time: true, serviceId: true, professionalId: true,
        service: { select: { durationMinutes: true } }, professional: { select: { name: true } },
      },
    });
    if (!a) return null;
    return {
      data: a.date.toISOString().slice(0, 10), hora: a.time.toISOString().slice(11, 16),
      serviceId: a.serviceId, professionalId: a.professionalId,
      duracao: a.service.durationMinutes, profissional: a.professional.name,
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

  async entradasAguardando(businessId: string): Promise<EntradaEspera[]> {
    const rows = await prisma.waitlistEntry.findMany({
      where: { businessId, status: 'aguardando' },
      orderBy: { createdAt: 'asc' },
      include: { client: { select: { name: true, phone: true } }, service: { select: { durationMinutes: true } } },
    });
    return rows.map((r) => ({
      id: r.id, clientId: r.clientId, nome: r.client.name, phone: r.client.phone,
      serviceId: r.serviceId, professionalId: r.professionalId,
      desiredDate: r.desiredDate ? r.desiredDate.toISOString().slice(0, 10) : null,
      period: r.period, duracaoServico: r.service.durationMinutes,
    }));
  },

  /** Mesmo valor de waitlistService.offer ('oferecida'); só se ainda estiver aguardando. */
  async marcarOferecida(id: string, businessId: string, quando: Date): Promise<boolean> {
    const r = await prisma.waitlistEntry.updateMany({
      where: { id, businessId, status: 'aguardando' }, data: { status: 'oferecida', offeredAt: quando },
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
