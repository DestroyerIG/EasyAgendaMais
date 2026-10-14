import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { splitCommission } from './commissionSplit.js';
import type { ComandaCalc } from './comandaMath.js';
import type { NewExtraItem, PaymentMethod } from './comandas.types.js';

const APPOINTMENT_SELECT = {
  id: true, businessId: true, status: true, date: true, time: true, source: true, depositAmount: true,
  client: { select: { id: true, name: true, phone: true } },
  professional: { select: { id: true, name: true, commissionServicePct: true, commissionProductPct: true } },
  service: { select: { id: true, name: true, price: true, durationMinutes: true } },
} as const;

export type AppointmentForComanda = Prisma.AppointmentGetPayload<{ select: typeof APPOINTMENT_SELECT }>;

export const comandasRepository = {
  findAppointmentForComanda(appointmentId: string, businessId: string) {
    return prisma.appointment.findFirst({ where: { id: appointmentId, businessId }, select: APPOINTMENT_SELECT });
  },

  findComandaByAppointment(appointmentId: string, businessId: string) {
    return prisma.comanda.findFirst({ where: { appointmentId, businessId }, select: { id: true } });
  },

  /** Número sequencial por negócio sob advisory lock; serviço principal como 1º item. */
  createComanda(businessId: string, appt: AppointmentForComanda, opts: { startAppointment: boolean }) {
    return prisma.$transaction(async (tx) => {
      const chave = `comanda|${businessId}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${chave}::text))`;
      const existente = await tx.comanda.findFirst({ where: { appointmentId: appt.id }, select: { id: true } });
      if (existente) return existente;
      const max = await tx.comanda.aggregate({ where: { businessId }, _max: { number: true } });
      const comanda = await tx.comanda.create({
        data: {
          businessId, number: (max._max.number ?? 1000) + 1, appointmentId: appt.id,
          clientId: appt.client.id, professionalId: appt.professional.id,
          items: { create: [{
            kind: 'servico', serviceId: appt.service.id, name: appt.service.name,
            unitPrice: appt.service.price, quantity: 1, durationMinutes: appt.service.durationMinutes, isMain: true,
          }] },
        },
        select: { id: true },
      });
      if (opts.startAppointment) {
        await tx.appointment.updateMany({ where: { id: appt.id, status: 'confirmado' }, data: { status: 'em_atendimento', startedAt: new Date() } });
      }
      return comanda;
    });
  },

  findComandaById(id: string, businessId: string) {
    return prisma.comanda.findFirst({
      where: { id, businessId },
      select: {
        id: true, number: true, status: true, businessId: true,
        discountAmount: true, tipAmount: true, paymentMethod: true, closedAt: true,
        servicesTotal: true, productsTotal: true, depositApplied: true, totalCharged: true, commissionTotal: true, receiptSentAt: true,
        appointment: { select: APPOINTMENT_SELECT },
        items: {
          select: { id: true, kind: true, serviceId: true, productId: true, name: true, unitPrice: true, quantity: true, durationMinutes: true, isMain: true, commissionPct: true },
          orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });
  },

  findActiveServicesByIds(businessId: string, ids: string[]) {
    if (ids.length === 0) return Promise.resolve([]);
    return prisma.service.findMany({
      where: { businessId, active: true, id: { in: ids } },
      select: { id: true, name: true, price: true, durationMinutes: true },
    });
  },

  /**
   * Salva o rascunho numa única transação. O updateMany condicionado a status 'rascunho' é a guarda
   * (e toma o lock da linha): se a comanda já foi fechada, devolve false sem tocar nos itens.
   */
  saveDraft(comandaId: string, businessId: string, extras: NewExtraItem[], totals: {
    servicesTotal: number; productsTotal: number; depositApplied: number; discountAmount: number;
    tipAmount: number; totalCharged: number; commissionTotal: number; paymentMethod: PaymentMethod | null;
  }): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const r = await tx.comanda.updateMany({ where: { id: comandaId, businessId, status: 'rascunho' }, data: totals });
      if (r.count !== 1) return false;
      await tx.comandaItem.deleteMany({ where: { comandaId, isMain: false } });
      if (extras.length > 0) {
        await tx.comandaItem.createMany({ data: extras.map((e) => ({ ...e, comandaId, isMain: false })) });
      }
      return true;
    });
  },

  findOpenCashSession(businessId: string, date: string) {
    return prisma.cashSession.findFirst({ where: { businessId, date: new Date(date), closedAt: null }, select: { id: true } });
  },

  /**
   * Fecha numa transação: compare-and-set no status da comanda (rascunho → fechada),
   * fotografa percentuais nos itens, conclui o agendamento e grava/atualiza o earning.
   * Devolve false se outra requisição já fechou.
   */
  closeComandaTx(args: {
    comandaId: string; businessId: string; userId: string; cashSessionId: string;
    appointmentId: string; appointmentDate: Date; paymentMethod: PaymentMethod | null;
    servicePct: number; productPct: number; calc: ComandaCalc;
  }): Promise<boolean> {
    const { calc } = args;
    return prisma.$transaction(async (tx) => {
      const r = await tx.comanda.updateMany({
        where: { id: args.comandaId, businessId: args.businessId, status: 'rascunho' },
        data: {
          status: 'fechada', closedAt: new Date(), closedBy: args.userId, cashSessionId: args.cashSessionId,
          paymentMethod: args.paymentMethod,
          servicesTotal: calc.servicesTotal, productsTotal: calc.productsTotal, depositApplied: calc.depositApplied,
          discountAmount: calc.discount, tipAmount: calc.tip, totalCharged: calc.totalCharged,
          commissionTotal: calc.commissionTotal,
        },
      });
      if (r.count !== 1) return false;

      // O updateMany acima já tomou o lock da linha: relê os itens aqui dentro, sem confiar em ids de fora.
      const itens = await tx.comandaItem.findMany({
        where: { comandaId: args.comandaId }, select: { id: true, kind: true, unitPrice: true, quantity: true },
        orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }, { id: 'asc' }],
      });
      for (const kind of ['servico', 'produto'] as const) {
        const doTipo = itens.filter((i) => i.kind === kind);
        const partes = splitCommission(
          doTipo.map((i) => Math.round(Number(i.unitPrice) * 100) * i.quantity),
          kind === 'servico' ? calc.commissionService : calc.commissionProduct,
        );
        for (let n = 0; n < doTipo.length; n++) {
          await tx.comandaItem.update({
            where: { id: doTipo[n]!.id },
            data: { commissionPct: kind === 'servico' ? args.servicePct : args.productPct, commissionAmount: partes[n]! },
          });
        }
      }

      await tx.appointment.updateMany({
        where: { id: args.appointmentId, status: { in: ['confirmado', 'em_atendimento'] } },
        data: { status: 'concluido', finishedAt: new Date() },
      });

      await tx.earning.upsert({
        where: { appointmentId: args.appointmentId },
        create: { businessId: args.businessId, appointmentId: args.appointmentId, amount: calc.revenue, date: args.appointmentDate },
        update: { amount: calc.revenue },
      });
      return true;
    });
  },

  markReceiptSent(comandaId: string) {
    return prisma.comanda.update({ where: { id: comandaId }, data: { receiptSentAt: new Date() } });
  },

  /** Itens extras (não principais) mais usados em comandas fechadas nos últimos `dias`. */
  topExtras(businessId: string, dias: number, limite: number) {
    return prisma.$queryRaw<Array<{ kind: 'servico' | 'produto'; id: string; name: string; price: unknown }>>(Prisma.sql`
      SELECT x.kind, x.id, x.name, x.price FROM (
        SELECT 'servico' AS kind, s.id::text AS id, s.name, s.price, COUNT(*) AS usos
          FROM comanda_items i
          JOIN comandas c ON c.id = i.comanda_id
          JOIN services s ON s.id = i.service_id AND s.active = true
         WHERE c.business_id = ${businessId}::uuid AND c.status = 'fechada' AND i.is_main = false
           AND c.closed_at >= NOW() - (${dias}::int * INTERVAL '1 day')
         GROUP BY s.id
        UNION ALL
        SELECT 'produto', p.id::text, p.name, p.price, COUNT(*)
          FROM comanda_items i
          JOIN comandas c ON c.id = i.comanda_id
          JOIN products p ON p.id = i.product_id AND p.active = true
         WHERE c.business_id = ${businessId}::uuid AND c.status = 'fechada' AND i.is_main = false
           AND c.closed_at >= NOW() - (${dias}::int * INTERVAL '1 day')
         GROUP BY p.id
      ) x
      ORDER BY x.usos DESC, x.name ASC
      LIMIT ${limite}
    `);
  },
};
