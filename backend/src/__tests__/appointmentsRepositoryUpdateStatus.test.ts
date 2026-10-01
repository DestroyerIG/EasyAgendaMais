import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '../config/prisma.js';
import { appointmentsPrismaRepository } from '../modules/appointments/appointments.repository.js';

vi.mock('../config/prisma.js', () => ({
  prisma: {
    appointment: { updateMany: vi.fn(), findFirst: vi.fn() },
  },
}));

const updateMany = prisma.appointment.updateMany as unknown as ReturnType<typeof vi.fn>;
const findFirst = prisma.appointment.findFirst as unknown as ReturnType<typeof vi.fn>;

describe('appointmentsPrismaRepository.updateStatus — transição atômica e condicional', () => {
  beforeEach(() => vi.clearAllMocks());

  it('confirmar pagamento exige status aguardando_pagamento E expiresAt no futuro, num único UPDATE', async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({ id: 'apt-1', status: 'confirmado' });

    const before = Date.now();
    const result = await appointmentsPrismaRepository.updateStatus('apt-1', 'biz-1', 'confirmado', 'aguardando_pagamento');

    expect(result).toEqual({ id: 'apt-1', status: 'confirmado' });
    const arg = updateMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({ id: 'apt-1', businessId: 'biz-1', status: 'aguardando_pagamento' });
    expect(arg.where.expiresAt.gt).toBeInstanceOf(Date);
    expect(arg.where.expiresAt.gt.getTime()).toBeGreaterThanOrEqual(before);
    expect(arg.data).toEqual({ status: 'confirmado' });
  });

  it('retorna null quando a reserva já expirou (nenhuma linha alterada)', async () => {
    updateMany.mockResolvedValue({ count: 0 });

    const result = await appointmentsPrismaRepository.updateStatus('apt-1', 'biz-1', 'confirmado', 'aguardando_pagamento');

    expect(result).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('cancelar uma reserva pendente não exige que ela esteja dentro do prazo', async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({ id: 'apt-1', status: 'cancelado' });

    await appointmentsPrismaRepository.updateStatus('apt-1', 'biz-1', 'cancelado', 'aguardando_pagamento');

    expect(updateMany.mock.calls[0][0].where).not.toHaveProperty('expiresAt');
  });

  it('outras transições também são compare-and-set sobre o status lido', async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findFirst.mockResolvedValue({ id: 'apt-1', status: 'concluido' });

    await appointmentsPrismaRepository.updateStatus('apt-1', 'biz-1', 'concluido', 'confirmado');

    expect(updateMany.mock.calls[0][0].where).toEqual({ id: 'apt-1', businessId: 'biz-1', status: 'confirmado' });
  });
});
