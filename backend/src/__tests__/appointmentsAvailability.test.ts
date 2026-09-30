import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '../config/prisma.js';
import { appointmentsPrismaRepository } from '../modules/appointments/appointments.repository.js';

vi.mock('../config/prisma.js', () => ({
  prisma: {
    appointment: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe('hasConflict com aguardando_pagamento', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('considera aguardando_pagamento não expirado como conflito', async () => {
    (prisma.appointment.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'apt-1' });

    const result = await appointmentsPrismaRepository.hasConflict(
      'biz-1', 'prof-1', '2026-10-24', '14:00:00'
    );

    expect(result).toBe(true);
    const whereArg = (prisma.appointment.findFirst as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
    expect(whereArg.status.in).toEqual(
      expect.arrayContaining(['confirmado', 'aguardando_pagamento'])
    );
    expect(whereArg.OR).toBeDefined();
  });
});
