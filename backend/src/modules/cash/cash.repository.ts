import { prisma } from '../../config/prisma.js';

export const cashRepository = {
  findSession(businessId: string, date: string) {
    return prisma.cashSession.findUnique({ where: { businessId_date: { businessId, date: new Date(date) } } });
  },
  createSession(businessId: string, date: string, userId: string, openingBalance: number) {
    return prisma.cashSession.create({ data: { businessId, date: new Date(date), openedBy: userId, openingBalance } });
  },
  async closeSession(id: string, userId: string, d: { countedBalance: number; expectedBalance: number; difference: number; notes: string | null }) {
    const r = await prisma.cashSession.updateMany({ where: { id, closedAt: null }, data: { ...d, closedAt: new Date(), closedBy: userId } });
    return r.count === 1;
  },
  /** Desfaz o fechamento: volta a aceitar comandas e movimentos. Só age se estiver fechado. */
  async reopenSession(id: string) {
    const r = await prisma.cashSession.updateMany({
      where: { id, closedAt: { not: null } },
      data: { closedAt: null, closedBy: null, countedBalance: null, expectedBalance: null, difference: null },
    });
    return r.count === 1;
  },
  addMovement(sessionId: string, businessId: string, userId: string, m: { kind: string; amount: number; description: string }) {
    return prisma.cashMovement.create({ data: { cashSessionId: sessionId, businessId, createdBy: userId, ...m } });
  },
  findClosedComandas(sessionId: string) {
    return prisma.comanda.findMany({
      where: { cashSessionId: sessionId, status: 'fechada' },
      select: {
        id: true, number: true, paymentMethod: true, totalCharged: true, depositApplied: true,
        appointment: { select: { id: true, time: true } },
        client: { select: { name: true, phone: true } },
        professional: { select: { name: true } },
        items: { select: { name: true }, orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }] },
      },
    });
  },
  findAppointmentsByStatus(businessId: string, date: string, status: 'em_atendimento' | 'faltou') {
    return prisma.appointment.findMany({
      where: { businessId, date: new Date(date), status },
      select: {
        id: true, time: true, depositAmount: true,
        client: { select: { name: true, phone: true } },
        professional: { select: { name: true } },
        service: { select: { name: true, price: true } },
        comanda: { select: { enviadaRecepcaoEm: true } },
      },
    });
  },
  findExpenses(businessId: string, date: string) {
    return prisma.expense.findMany({ where: { businessId, date: new Date(date) }, orderBy: { createdAt: 'asc' } });
  },
  findMovements(sessionId: string) {
    return prisma.cashMovement.findMany({ where: { cashSessionId: sessionId }, orderBy: { createdAt: 'asc' } });
  },
  async ownerName(businessId: string) {
    return (await prisma.business.findUnique({ where: { id: businessId }, select: { ownerName: true } }))?.ownerName ?? '';
  },
};
