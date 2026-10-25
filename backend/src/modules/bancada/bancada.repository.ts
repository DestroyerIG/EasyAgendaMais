import { prisma } from '../../config/prisma.js';

// Consultas do app da profissional: tudo filtrado pela profissional do login.

const ymd = (d: Date) => d.toISOString().slice(0, 10);
// `time` é @db.Time gravado com "Z": o valor literal está nos componentes UTC.
const hhmm = (t: Date) => t.toISOString().slice(11, 16);
const n = (v: unknown) => Number(v ?? 0);

export const bancadaRepository = {
  /** A profissional do login, conferida a cada requisição (bloqueio e desativação valem na hora). */
  usuarioProfissional(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: { blocked: true, businessId: true, professional: { select: { id: true, name: true, active: true, businessId: true } } },
    });
  },

  async profissionalCobra(businessId: string): Promise<boolean> {
    const s = await prisma.businessSettings.findUnique({ where: { businessId }, select: { profissionalCobra: true } });
    return s?.profissionalCobra ?? false;
  },

  async agendaDoDia(businessId: string, professionalId: string, data: string) {
    const lista = await prisma.appointment.findMany({
      where: { businessId, professionalId, date: new Date(data), status: { not: 'cancelado' } },
      orderBy: { time: 'asc' },
      select: {
        id: true, time: true, status: true, source: true, depositAmount: true, clientConfirmedAt: true,
        client: { select: { id: true, name: true, phone: true } },
        service: { select: { id: true, name: true, durationMinutes: true, price: true } },
        comanda: { select: { id: true, status: true, totalCharged: true, depositApplied: true, paymentMethod: true, enviadaRecepcaoEm: true } },
      },
    });
    return lista.map((a) => ({
      id: a.id, time: hhmm(a.time), status: a.status, source: a.source,
      deposito: n(a.depositAmount), confirmouWhatsapp: a.clientConfirmedAt !== null,
      cliente: a.client,
      servico: { id: a.service.id, nome: a.service.name, duracao: a.service.durationMinutes, preco: n(a.service.price) },
      comanda: a.comanda ? {
        id: a.comanda.id, status: a.comanda.status, pago: n(a.comanda.totalCharged) + n(a.comanda.depositApplied),
        forma: a.comanda.paymentMethod, enviadaRecepcaoEm: a.comanda.enviadaRecepcaoEm?.toISOString() ?? null,
      } : null,
    }));
  },

  /** A profissional só enxerga a cliente que tem (ou teve) agendamento com ela. */
  async clienteDaProfissional(businessId: string, professionalId: string, clientId: string): Promise<boolean> {
    return (await prisma.appointment.count({ where: { businessId, professionalId, clientId } })) > 0;
  },

  /** As clientes dela (com agendamento passado ou futuro), por nome ou telefone. */
  async clientesDela(businessId: string, professionalId: string, busca: string | null) {
    const termo = busca?.trim() ?? '';
    const digitos = termo.replace(/\D/g, '');
    return prisma.client.findMany({
      where: {
        businessId,
        appointments: { some: { professionalId } },
        ...(termo ? { OR: [
          { name: { contains: termo, mode: 'insensitive' as const } },
          ...(digitos.length >= 3 ? [{ phone: { contains: digitos } }] : []),
        ] } : {}),
      },
      orderBy: { name: 'asc' }, take: 40,
      select: { id: true, name: true, phone: true },
    });
  },

  async visitasConcluidas(businessId: string, clientId: string): Promise<number> {
    return prisma.appointment.count({ where: { businessId, clientId, status: 'concluido' } });
  },

  async visitasComEla(businessId: string, professionalId: string, clientId: string, quantas = 3) {
    const lista = await prisma.appointment.findMany({
      where: { businessId, professionalId, clientId, status: 'concluido' },
      orderBy: [{ date: 'desc' }, { time: 'desc' }], take: quantas,
      select: {
        id: true, date: true, service: { select: { name: true } },
        comanda: { select: { totalCharged: true, depositApplied: true, items: { where: { isMain: false }, select: { name: true } } } },
      },
    });
    return lista.map((a) => ({
      id: a.id, data: ymd(a.date),
      servicos: [a.service.name, ...(a.comanda?.items.map((i) => i.name) ?? [])].join(' + '),
      valor: a.comanda ? n(a.comanda.totalCharged) + n(a.comanda.depositApplied) : null,
    }));
  },

  async agendamentoDela(businessId: string, professionalId: string, id: string) {
    const a = await prisma.appointment.findFirst({
      where: { id, businessId, professionalId },
      select: {
        id: true, status: true, date: true, time: true, clientId: true, serviceId: true,
        client: { select: { name: true, phone: true } }, service: { select: { name: true } },
      },
    });
    return a ? { ...a, date: ymd(a.date), time: hhmm(a.time) } : null;
  },

  async comandaDela(businessId: string, professionalId: string, id: string) {
    return prisma.comanda.findFirst({ where: { id, businessId, professionalId }, select: { id: true, clientId: true } });
  },

  /** Compare-and-set no status: só muda se ainda estiver confirmado. */
  async reagendar(businessId: string, id: string, data: string, hora: string): Promise<boolean> {
    const r = await prisma.appointment.updateMany({
      where: { id, businessId, status: 'confirmado' },
      data: { date: new Date(data), time: new Date(`1970-01-01T${hora}:00Z`) },
    });
    return r.count === 1;
  },

  marcarEnviadaRecepcao(comandaId: string) {
    return prisma.comanda.update({ where: { id: comandaId }, data: { enviadaRecepcaoEm: new Date() } });
  },

  salvarNota(businessId: string, clientId: string, notas: string | null) {
    return prisma.client.updateMany({ where: { id: clientId, businessId }, data: { notes: notas } });
  },

  async extrato(businessId: string, professionalId: string, intervalo: { gte: Date; lt: Date }) {
    const lista = await prisma.comanda.findMany({
      where: { businessId, professionalId, status: 'fechada', closedAt: intervalo },
      orderBy: { closedAt: 'desc' },
      select: {
        id: true, number: true, closedAt: true, tipAmount: true, totalCharged: true, depositApplied: true,
        client: { select: { name: true } },
        appointment: { select: { time: true } },
        items: { select: { kind: true, name: true, quantity: true, unitPrice: true, commissionAmount: true, valorCoberto: true, isMain: true } },
      },
    });
    return lista.map((k) => ({
      id: k.id, numero: k.number, fechadaEm: k.closedAt!.toISOString(), hora: hhmm(k.appointment.time),
      cliente: k.client.name, gorjeta: n(k.tipAmount), pago: n(k.totalCharged) + n(k.depositApplied),
      itens: k.items.map((i) => ({
        kind: i.kind, nome: i.name, quantidade: i.quantity, valor: n(i.unitPrice) * i.quantity,
        commissionAmount: n(i.commissionAmount), coberto: i.valorCoberto !== null && n(i.valorCoberto) > 0,
      })),
    }));
  },

  async avaliacoes(businessId: string, professionalId: string, intervalo: { gte: Date; lt: Date }) {
    const lista = await prisma.whatsappRating.findMany({
      where: { businessId, createdAt: intervalo, appointment: { professionalId } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, rating: true, comment: true, createdAt: true, origem: true,
        appointment: { select: { date: true, client: { select: { name: true } }, service: { select: { name: true } } } },
      },
    });
    return lista.map((r) => ({
      id: r.id, nota: r.rating, comentario: r.comment, criadaEm: r.createdAt.toISOString(), origem: r.origem,
      cliente: r.appointment.client.name, servico: r.appointment.service.name, data: ymd(r.appointment.date),
    }));
  },

  async nomeDoNegocio(businessId: string): Promise<string> {
    return (await prisma.business.findUnique({ where: { id: businessId }, select: { name: true } }))?.name ?? '';
  },
};
