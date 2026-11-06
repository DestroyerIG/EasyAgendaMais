import { describe, it, expect, vi, beforeEach } from 'vitest';

const findMany = vi.hoisted(() => vi.fn());
vi.mock('../config/prisma.js', () => ({ prisma: { cobrancaSinal: { findMany } } }));

const { recebimentosRepository } = await import('../modules/recebimentos/recebimentos.repository.js');

beforeEach(() => {
  vi.clearAllMocks();
  findMany.mockResolvedValue([]);
});

describe('recebimentosRepository.reservasComSinalNoCartao', () => {
  it('considera só cobrança paga, de cartão e com id externo (pagamento repetido fica de fora)', async () => {
    findMany.mockResolvedValue([{ appointmentId: 'a1' }, { appointmentId: 'a1' }]);
    const r = await recebimentosRepository.reservasComSinalNoCartao('b1', ['a1', 'a2']);
    expect(r).toEqual(new Set(['a1']));
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0].where).toEqual({
      businessId: 'b1', appointmentId: { in: ['a1', 'a2'] }, situacao: 'paga', forma: 'cartao', idExterno: { not: null },
    });
  });

  it('lista vazia devolve conjunto vazio sem consultar o banco', async () => {
    expect(await recebimentosRepository.reservasComSinalNoCartao('b1', [])).toEqual(new Set());
    expect(await recebimentosRepository.reservasComCobrancaPendente('b1', [])).toEqual(new Set());
    expect(findMany).not.toHaveBeenCalled();
  });
});
