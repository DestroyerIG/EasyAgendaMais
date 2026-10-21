import { prisma } from '../../config/prisma.js';

export interface AgendamentoRotina {
  id: string;
  clientId: string;
  nome: string;
  phone: string;
  servico: string;
  profissional: string;
  hora: string; // HH:MM (relógio do negócio)
  createdAt: Date;
  consentimentoRevogado: boolean;
}

export interface Aniversariante { id: string; nome: string; phone: string; birthDate: Date }

const diaUtc = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

export const rotinasRepository = {
  async negociosComRegraAtiva(regra: string): Promise<string[]> {
    const rows = await prisma.whatsappAutomacao.findMany({ where: { regra, ativa: true }, select: { businessId: true } });
    return rows.map((r) => r.businessId);
  },

  async negocio(businessId: string): Promise<{ nome: string; slug: string | null; endereco: string | null }> {
    const [b, s] = await Promise.all([
      prisma.business.findUnique({ where: { id: businessId }, select: { name: true, slug: true } }),
      prisma.businessSettings.findUnique({ where: { businessId }, select: { address: true } }),
    ]);
    return { nome: b?.name ?? '', slug: b?.slug ?? null, endereco: s?.address?.trim() || null };
  },

  /** Agendamentos `confirmado` do dia: sem confirmação enviada ou sem lembrete enviado. */
  async agendamentosDoDia(businessId: string, ymd: string, pendente: 'confirmacao' | 'lembrete'): Promise<AgendamentoRotina[]> {
    const rows = await prisma.appointment.findMany({
      where: {
        businessId, date: diaUtc(ymd), status: 'confirmado',
        ...(pendente === 'confirmacao' ? { confirmationSentAt: null } : { reminderSent: false }),
      },
      orderBy: { time: 'asc' },
      select: {
        id: true, clientId: true, time: true, createdAt: true,
        client: {
          select: {
            name: true, phone: true,
            consents: {
              where: { kind: 'whatsapp_lembretes' }, orderBy: { grantedAt: 'desc' }, take: 1,
              select: { granted: true, revokedAt: true },
            },
          },
        },
        service: { select: { name: true } },
        professional: { select: { name: true } },
      },
    });
    return rows.map((a) => {
      const c = a.client.consents?.[0];
      return {
        id: a.id, clientId: a.clientId, nome: a.client.name, phone: a.client.phone,
        servico: a.service.name, profissional: a.professional.name,
        hora: a.time.toISOString().slice(11, 16), createdAt: a.createdAt,
        consentimentoRevogado: !!c && (!c.granted || !!c.revokedAt),
      };
    });
  },

  /** Só grava se ainda estiver nulo. */
  async marcarConfirmacaoEnviada(businessId: string, id: string, quando: Date): Promise<boolean> {
    const r = await prisma.appointment.updateMany({
      where: { id, businessId, confirmationSentAt: null }, data: { confirmationSentAt: quando },
    });
    return r.count > 0;
  },

  async marcarLembreteEnviado(businessId: string, id: string): Promise<void> {
    await prisma.appointment.updateMany({ where: { id, businessId }, data: { reminderSent: true } });
  },

  async clientesComAniversario(businessId: string): Promise<Aniversariante[]> {
    const rows = await prisma.client.findMany({
      where: { businessId, active: true, birthDate: { not: null } },
      select: { id: true, name: true, phone: true, birthDate: true },
    });
    return rows.flatMap((c) => (c.birthDate ? [{ id: c.id, nome: c.name, phone: c.phone, birthDate: c.birthDate }] : []));
  },

  /** Clientes (entre os informados) com algum envio da origem criado desde `desde`. */
  async clientesComEnvioDesde(businessId: string, origin: string, desde: Date, clientIds: string[]): Promise<Set<string>> {
    if (!clientIds.length) return new Set();
    const rows = await prisma.whatsappEnvio.findMany({
      where: { businessId, origin, createdAt: { gte: desde }, clientId: { in: clientIds } },
      select: { clientId: true },
    });
    return new Set(rows.flatMap((r) => (r.clientId ? [r.clientId] : [])));
  },

  async existeLote(businessId: string, batchId: string): Promise<boolean> {
    return (await prisma.whatsappEnvio.count({ where: { businessId, batchId } })) > 0;
  },
};
