import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '../config/prisma.js';
import { expirePendingAppointments } from '../services/cronService.js';

vi.mock('../config/prisma.js', () => ({
  prisma: {
    appointment: {
      updateMany: vi.fn().mockResolvedValue({ count: 3 }),
    },
  },
}));

describe('expirePendingAppointments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cancela agendamentos aguardando_pagamento com expiresAt no passado', async () => {
    const count = await expirePendingAppointments(new Date('2026-10-24T15:00:00Z'));

    expect(count).toBe(3);
    expect(prisma.appointment.updateMany).toHaveBeenCalledWith({
      where: {
        status: 'aguardando_pagamento',
        expiresAt: { lt: new Date('2026-10-24T15:00:00Z') },
      },
      data: { status: 'cancelado' },
    });
  });
});
