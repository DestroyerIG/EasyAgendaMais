import { describe, it, expect, vi, beforeEach } from 'vitest';

const tx = vi.hoisted(() => ({
  comanda: { updateMany: vi.fn() },
  comandaItem: { findMany: vi.fn(), update: vi.fn() },
  appointment: { updateMany: vi.fn() },
  earning: { upsert: vi.fn() },
  $queryRaw: vi.fn(),
}));
vi.mock('../config/prisma.js', () => ({
  prisma: { $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)) },
}));

const { comandasRepository } = await import('../modules/comandas/comandas.repository.js');
const { calcularComanda } = await import('../modules/comandas/comandaMath.js');

const args = () => ({
  comandaId: 'k1', businessId: 'b1', userId: 'u1', cashSessionId: 'cx1',
  appointmentId: 'a1', appointmentDate: new Date('2026-10-13'), paymentMethod: 'pix' as const,
  servicePct: 50, productPct: 20,
  calc: calcularComanda({
    items: [{ kind: 'servico', unitPrice: 110, quantity: 1 }], depositAvailable: 0, discount: 0, tip: 0,
    serviceCommissionPct: 50, productCommissionPct: 20,
  }),
});

beforeEach(() => {
  vi.clearAllMocks();
  tx.comanda.updateMany.mockResolvedValue({ count: 1 });
  tx.$queryRaw.mockResolvedValue([{ id: 'cx1' }]);
  tx.comandaItem.findMany.mockResolvedValue([{ id: 'i1', kind: 'servico', unitPrice: '110.00', quantity: 1 }]);
  tx.appointment.updateMany.mockResolvedValue({ count: 1 });
});

describe('comandasRepository.closeComandaTx', () => {
  it('fecha, conclui o agendamento e grava o earning', async () => {
    await expect(comandasRepository.closeComandaTx(args())).resolves.toBe(true);
    expect(tx.earning.upsert).toHaveBeenCalled();
  });

  it('caixa fechado no meio do caminho desfaz o fechamento com CASH_ALREADY_CLOSED', async () => {
    tx.$queryRaw.mockResolvedValue([]);
    await expect(comandasRepository.closeComandaTx(args())).rejects.toMatchObject({
      statusCode: 409, code: 'CASH_ALREADY_CLOSED', message: 'O caixa de hoje já foi fechado',
    });
    expect(tx.appointment.updateMany).not.toHaveBeenCalled();
    expect(tx.earning.upsert).not.toHaveBeenCalled();
  });

  it('agendamento que saiu de confirmado/em atendimento desfaz o fechamento', async () => {
    tx.appointment.updateMany.mockResolvedValue({ count: 0 });
    await expect(comandasRepository.closeComandaTx(args())).rejects.toMatchObject({
      statusCode: 409, message: 'Este agendamento não pode mais ser concluído',
    });
    expect(tx.earning.upsert).not.toHaveBeenCalled();
  });

  it('comanda já fechada por outra requisição devolve false sem tocar no resto', async () => {
    tx.comanda.updateMany.mockResolvedValue({ count: 0 });
    await expect(comandasRepository.closeComandaTx(args())).resolves.toBe(false);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });
});
