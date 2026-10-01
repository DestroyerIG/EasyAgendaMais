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

vi.mock('../config/prisma.js', () => ({
  prisma: {
    appointment: {
      findMany: vi.fn().mockResolvedValue(TO_EXPIRE),
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
  },
}));

vi.mock('../modules/notifications/notifications.service.js', () => ({
  notificationsService: { notify: vi.fn().mockResolvedValue(undefined) },
}));

describe('expirePendingAppointments', () => {
  beforeEach(() => vi.clearAllMocks());

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
    expect(prisma.appointment.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['apt-1', 'apt-2'] } },
      data: { status: 'cancelado' },
    });
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
    expect(prisma.appointment.updateMany).not.toHaveBeenCalled();
    expect(notificationsService.notify).not.toHaveBeenCalled();
  });
});
