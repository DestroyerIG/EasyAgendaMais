import { describe, it, expect, vi, beforeEach } from 'vitest';

const findMany = vi.hoisted(() => vi.fn());
const warn = vi.hoisted(() => vi.fn());
vi.mock('../utils/logger.js', () => ({ default: { warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
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
      OR: [{ formaPaga: null }, { formaPaga: { not: 'pix' } }],
    });
  });

  it('lista vazia devolve conjunto vazio sem consultar o banco', async () => {
    expect(await recebimentosRepository.reservasComSinalNoCartao('b1', [])).toEqual(new Set());
    expect(await recebimentosRepository.reservasComCobrancaPendente('b1', [])).toEqual(new Set());
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe('falha na consulta', () => {
  it.each(['reservasComSinalNoCartao', 'reservasComCobrancaPendente'] as const)('%s devolve conjunto vazio e registra warn', async (fn) => {
    findMany.mockRejectedValue(new Error('relation "cobrancas_sinal" does not exist'));
    expect(await recebimentosRepository[fn]('b1', ['a1'])).toEqual(new Set());
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls[0][0])).not.toContain('a1');
  });
});

describe('conferência só do Mercado Pago', () => {
  it.each(['cobrancasParaConferir', 'cobrancasDoNegocioParaConferir'] as const)('%s filtra gateway mercadopago', async (fn) => {
    if (fn === 'cobrancasParaConferir') await recebimentosRepository.cobrancasParaConferir(new Date());
    else await recebimentosRepository.cobrancasDoNegocioParaConferir('b1', new Date());
    expect(findMany.mock.calls[0][0].where).toMatchObject({ gateway: 'mercadopago' });
  });
});
