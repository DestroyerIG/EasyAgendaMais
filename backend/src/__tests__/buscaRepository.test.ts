import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  client: { findMany: vi.fn() },
  appointment: { findMany: vi.fn() },
}));
vi.mock('../config/prisma.js', () => ({ prisma: prismaMock }));

const { buscaRepository } = await import('../modules/busca/busca.repository.js');

const linha = {
  id: 'a1', date: new Date('2026-11-06T00:00:00.000Z'), time: new Date('1970-01-01T14:30:00.000Z'), status: 'confirmado',
  client: { name: 'Ana' }, service: { name: 'Corte' }, professional: { name: 'Camila' },
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.client.findMany.mockResolvedValue([]);
  prismaMock.appointment.findMany.mockResolvedValue([linha]);
});

describe('buscaRepository', () => {
  it('clientesAtivos filtra por negócio e por active', async () => {
    prismaMock.client.findMany.mockResolvedValue([{ id: 'c1', name: 'Ana', phone: '1', email: null }]);
    const r = await buscaRepository.clientesAtivos('b1');
    expect(prismaMock.client.findMany).toHaveBeenCalledWith({
      where: { businessId: 'b1', active: true },
      select: { id: true, name: true, phone: true, email: true },
    });
    expect(r).toHaveLength(1);
  });

  it('agendamentosFuturos filtra negócio, clientes e cancelados, do mais próximo ao mais distante', async () => {
    await buscaRepository.agendamentosFuturos('b1', ['c1'], '2026-11-05');
    expect(prismaMock.appointment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        businessId: 'b1', clientId: { in: ['c1'] }, status: { not: 'cancelado' },
        date: { gte: new Date('2026-11-05T00:00:00.000Z') },
      },
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
      take: 5,
    }));
  });

  it('agendamentosPassados usa date lt e ordem decrescente', async () => {
    await buscaRepository.agendamentosPassados('b1', ['c1'], '2026-11-05');
    expect(prismaMock.appointment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        businessId: 'b1', clientId: { in: ['c1'] }, status: { not: 'cancelado' },
        date: { lt: new Date('2026-11-05T00:00:00.000Z') },
      },
      orderBy: [{ date: 'desc' }, { time: 'desc' }],
      take: 5,
    }));
  });

  it('converte date e time para texto', async () => {
    const [a] = await buscaRepository.agendamentosFuturos('b1', ['c1'], '2026-11-05');
    expect(a).toEqual({
      id: 'a1', data: '2026-11-06', hora: '14:30', status: 'confirmado',
      clienteNome: 'Ana', servicoNome: 'Corte', profissionalNome: 'Camila',
    });
  });
});
