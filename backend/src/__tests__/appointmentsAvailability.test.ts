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
    // Verify the exact OR array structure to prevent regressions
    expect(whereArg.OR).toEqual([
      { status: 'confirmado' },
      { status: 'aguardando_pagamento', expiresAt: { gt: expect.any(Date) } },
    ]);
  });
});

describe('getBookedSlots com aguardando_pagamento', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('bloqueia slots de aguardando_pagamento não expirado', async () => {
    const now = new Date();
    const futureDate = new Date(now.getTime() + 3600000); // 1 hour in future

    (prisma.appointment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        time: new Date('1970-01-01T14:00:00Z'),
      },
    ]);

    const result = await appointmentsPrismaRepository.getBookedSlots(
      'biz-1', 'prof-1', '2026-10-24'
    );

    expect(result).toEqual(['14:00']);
    const whereArg = (prisma.appointment.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
    // Verify the OR array contains both confirmed and non-expired pending statuses
    expect(whereArg.OR).toEqual([
      { status: 'confirmado' },
      { status: 'aguardando_pagamento', expiresAt: { gt: expect.any(Date) } },
    ]);
  });
});
