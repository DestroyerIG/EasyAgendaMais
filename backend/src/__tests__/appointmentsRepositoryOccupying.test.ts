import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({ appointment: { findFirst: vi.fn(), findMany: vi.fn() } }));
vi.mock('../config/prisma.js', () => ({ prisma: prismaMock }));

const { appointmentsPrismaRepository } = await import('../modules/appointments/appointments.repository.js');

describe('ocupação de horário inclui quem está em atendimento', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hasConflict considera em_atendimento', async () => {
    prismaMock.appointment.findFirst.mockResolvedValue(null);
    await appointmentsPrismaRepository.hasConflict('b1', 'p1', '2026-10-13', '10:00:00');
    const where = prismaMock.appointment.findFirst.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({ status: { in: ['confirmado', 'em_atendimento'] } });
  });

  it('getBookedSlots considera em_atendimento', async () => {
    prismaMock.appointment.findMany.mockResolvedValue([]);
    await appointmentsPrismaRepository.getBookedSlots('b1', 'p1', '2026-10-13');
    const where = prismaMock.appointment.findMany.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({ status: { in: ['confirmado', 'em_atendimento'] } });
  });
});
