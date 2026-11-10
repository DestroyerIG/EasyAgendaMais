import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '../config/prisma.js';
import { expirePendingAppointments } from '../services/cronService.js';
import { notificationsService } from '../modules/notifications/notifications.service.js';

const { TO_EXPIRE } = vi.hoisted(() => ({
  TO_EXPIRE: [
    {
      id: 'apt-1', businessId: 'biz-1',
      client: { name: 'Mariana' }, service: { name: 'Corte' },
    },
    {
      id: 'apt-2', businessId: 'biz-2',
      client: { name: 'Paula' }, service: { name: 'Manicure' },
    },
  ],
}));

const tx = vi.hoisted(() => ({
  appointment: { updateMany: vi.fn() },
  cobrancaSinal: { updateMany: vi.fn() },
}));

vi.mock('../config/prisma.js', () => ({
  prisma: {
    appointment: { findMany: vi.fn().mockResolvedValue(TO_EXPIRE) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  },
}));

vi.mock('../modules/notifications/notifications.service.js', () => ({
  notificationsService: { notify: vi.fn().mockResolvedValue(undefined) },
}));

describe('expirePendingAppointments', () => {
  const AGORA = new Date('2026-10-24T15:00:00Z');

  beforeEach(() => {
    vi.clearAllMocks();
    tx.appointment.updateMany.mockResolvedValue({ count: 1 });
    tx.cobrancaSinal.updateMany.mockResolvedValue({ count: 1 });
  });

  it('cancela agendamentos aguardando_pagamento com expiresAt no passado', async () => {
    const count = await expirePendingAppointments(new Date('2026-10-24T15:00:00Z'));

    expect(count).toBe(2);
    expect(prisma.appointment.findMany).toHaveBeenCalledWith({
      where: {
        status: 'aguardando_pagamento',
        expiresAt: { lt: new Date('2026-10-24T15:00:00Z') },
      },
      select: {
        id: true,
        businessId: true,
        client: { select: { name: true } },
        service: { select: { name: true } },
      },
    });
    for (const id of ['apt-1', 'apt-2']) {
      expect(tx.appointment.updateMany).toHaveBeenCalledWith({
        where: { id, status: 'aguardando_pagamento', expiresAt: { lt: AGORA } },
        data: { status: 'cancelado' },
      });
    }
  });

  it('marca as cobranças pendente e recusada das reservas vencidas como expirada, na mesma transação do cancelamento', async () => {
    await expirePendingAppointments(AGORA);

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    for (const appointmentId of ['apt-1', 'apt-2']) {
      expect(tx.cobrancaSinal.updateMany).toHaveBeenCalledWith({
        where: { appointmentId, tipo: 'sinal', situacao: { in: ['pendente', 'recusada'] } },
        data: { situacao: 'expirada' },
      });
    }
  });

  it('trava a cobrança antes da reserva, na mesma ordem da confirmação', async () => {
    await expirePendingAppointments(AGORA);

    expect(tx.cobrancaSinal.updateMany.mock.invocationCallOrder[0])
      .toBeLessThan(tx.appointment.updateMany.mock.invocationCallOrder[0]!);
  });

  it('reserva que saiu de aguardando_pagamento no meio da rotina não conta nem notifica', async () => {
    tx.appointment.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(expirePendingAppointments(AGORA)).resolves.toBe(1);
    expect(notificationsService.notify).toHaveBeenCalledTimes(1);
    expect(notificationsService.notify).toHaveBeenCalledWith('biz-2', expect.objectContaining({ type: 'reserva_expirada' }));
  });

  it('falha numa reserva não impede as outras', async () => {
    tx.appointment.updateMany.mockRejectedValueOnce(new Error('deadlock'));

    await expect(expirePendingAppointments(AGORA)).resolves.toBe(1);
    expect(notificationsService.notify).toHaveBeenCalledTimes(1);
  });

  it('notifica cada negócio dono de uma reserva expirada', async () => {
    await expirePendingAppointments(new Date('2026-10-24T15:00:00Z'));

    expect(notificationsService.notify).toHaveBeenCalledWith('biz-1', {
      type: 'reserva_expirada',
      title: 'Reserva expirada sem pagamento',
      description: 'Mariana · Corte',
    });
    expect(notificationsService.notify).toHaveBeenCalledWith('biz-2', {
      type: 'reserva_expirada',
      title: 'Reserva expirada sem pagamento',
      description: 'Paula · Manicure',
    });
    expect(notificationsService.notify).toHaveBeenCalledTimes(2);
  });

  it('não chama updateMany nem notify quando não há nada para expirar', async () => {
    (prisma.appointment.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const count = await expirePendingAppointments(new Date('2026-10-24T15:00:00Z'));

    expect(count).toBe(0);
    expect(tx.appointment.updateMany).not.toHaveBeenCalled();
    expect(tx.cobrancaSinal.updateMany).not.toHaveBeenCalled();
    expect(notificationsService.notify).not.toHaveBeenCalled();
  });
});
