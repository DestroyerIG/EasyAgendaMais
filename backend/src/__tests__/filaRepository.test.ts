import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ whatsappEnvio: { findFirst: vi.fn(), count: vi.fn(), findMany: vi.fn() } }));
vi.mock('../config/prisma.js', () => ({ prisma: db }));

const { filaRepository } = await import('../modules/whatsappFila/fila.repository.js');

beforeEach(() => vi.clearAllMocks());

describe('filaRepository: reserva conta como envio', () => {
  it('ultimoEnviado considera enviado e enviando, e dá intervalo máximo à reserva sem intervalo', async () => {
    const sentAt = new Date('2026-10-20T15:00:00Z');
    db.whatsappEnvio.findFirst.mockResolvedValue({ sentAt, intervalAfterS: null });
    const r = await filaRepository.ultimoEnviado('b1');
    expect(db.whatsappEnvio.findFirst.mock.calls[0][0].where).toMatchObject({ businessId: 'b1', status: { in: ['enviado', 'enviando'] } });
    expect(r).toEqual({ sentAt, intervalAfterS: 90 });
  });
  it('contarEnviadosDesde considera enviado e enviando', async () => {
    db.whatsappEnvio.count.mockResolvedValue(3);
    await filaRepository.contarEnviadosDesde('b1', new Date());
    expect(db.whatsappEnvio.count.mock.calls[0][0].where).toMatchObject({ businessId: 'b1', status: { in: ['enviado', 'enviando'] } });
  });
  it('naFilaDoCliente olha na_fila e enviando e sempre filtra por negócio', async () => {
    db.whatsappEnvio.findFirst.mockResolvedValue(null);
    await filaRepository.naFilaDoCliente('b1', 'c1', 'retorno');
    expect(db.whatsappEnvio.findFirst.mock.calls[0][0].where).toMatchObject({ businessId: 'b1', clientId: 'c1', status: { in: ['na_fila', 'enviando'] } });
  });
  it('isolamento: a fila do negócio e o próximo vencido filtram por businessId', async () => {
    db.whatsappEnvio.findMany.mockResolvedValue([]);
    db.whatsappEnvio.findFirst.mockResolvedValue(null);
    await filaRepository.idsNaFila('b1');
    await filaRepository.proximoVencido('b1', new Date());
    expect(db.whatsappEnvio.findMany.mock.calls[0][0].where).toMatchObject({ businessId: 'b1', status: 'na_fila' });
    expect(db.whatsappEnvio.findFirst.mock.calls[0][0].where).toMatchObject({ businessId: 'b1', status: 'na_fila' });
  });
  it('a ordem do próximo vencido começa pela prioridade', async () => {
    db.whatsappEnvio.findFirst.mockResolvedValue(null);
    await filaRepository.proximoVencido('b1', new Date());
    expect(db.whatsappEnvio.findFirst.mock.calls[0][0].orderBy).toEqual([{ priority: 'asc' }, { scheduledFor: 'asc' }, { createdAt: 'asc' }]);
  });
});
