import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  whatsappEnvio: { findFirst: vi.fn(), count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn(), updateMany: vi.fn() },
  whatsappCampanha: { findMany: vi.fn() },
}));
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

describe('filaRepository: lotes das campanhas', () => {
  const agora = new Date('2026-10-20T15:00:00Z');
  it('cadenciasEmEnvio: campanhas agendadas do negócio que já começaram e ainda têm itens pendentes', async () => {
    db.whatsappCampanha.findMany.mockResolvedValue([{ id: 'L1', cadencia: 10 }, { id: 'L2', cadencia: 60 }]);
    db.whatsappEnvio.findMany.mockResolvedValue([{ batchId: 'L1' }]);
    const r = await filaRepository.cadenciasEmEnvio('b1', agora);
    expect(db.whatsappCampanha.findMany.mock.calls[0][0].where).toEqual({ businessId: 'b1', status: 'agendada', inicioEm: { lte: agora } });
    expect(db.whatsappEnvio.findMany.mock.calls[0][0]).toMatchObject({
      where: { businessId: 'b1', origin: 'campanha', status: { in: ['na_fila', 'enviando'] }, batchId: { in: ['L1', 'L2'] } },
      distinct: ['batchId'],
    });
    // L2 está agendada e já começou, mas não tem mais nada na fila: terminou, não conta.
    expect(r).toEqual([{ id: 'L1', cadencia: 10 }]);
  });
  it('cadenciasEmEnvio sem campanhas candidatas não consulta os envios', async () => {
    db.whatsappCampanha.findMany.mockResolvedValue([]);
    expect(await filaRepository.cadenciasEmEnvio('b1', agora)).toEqual([]);
    expect(db.whatsappEnvio.findMany).not.toHaveBeenCalled();
  });
  it('contarEnviadosDoLoteDesde agrupa por lote (enviado e enviando) e não consulta sem lotes', async () => {
    expect(await filaRepository.contarEnviadosDoLoteDesde('b1', [], agora)).toEqual(new Map());
    expect(db.whatsappEnvio.groupBy).not.toHaveBeenCalled();
    db.whatsappEnvio.groupBy.mockResolvedValue([{ batchId: 'L1', _count: { _all: 4 } }]);
    const r = await filaRepository.contarEnviadosDoLoteDesde('b1', ['L1', 'L2'], agora);
    expect(db.whatsappEnvio.groupBy.mock.calls[0][0].where).toEqual({
      businessId: 'b1', batchId: { in: ['L1', 'L2'] }, status: { in: ['enviado', 'enviando'] }, sentAt: { gte: agora },
    });
    expect(r).toEqual(new Map([['L1', 4]]));
  });
  it('proximoVencido sem lotes excluídos mantém o filtro antigo; com lotes, deixa de fora só eles', async () => {
    db.whatsappEnvio.findFirst.mockResolvedValue(null);
    await filaRepository.proximoVencido('b1', agora);
    await filaRepository.proximoVencido('b1', agora, ['L1']);
    expect(db.whatsappEnvio.findFirst.mock.calls[0][0].where).toEqual({ businessId: 'b1', status: 'na_fila', scheduledFor: { lte: agora } });
    expect(db.whatsappEnvio.findFirst.mock.calls[1][0].where).toEqual({
      businessId: 'b1', status: 'na_fila', scheduledFor: { lte: agora },
      OR: [{ batchId: null }, { batchId: { notIn: ['L1'] } }],
    });
  });
  it('cancelarDoLote cancela só o que está na fila do lote', async () => {
    db.whatsappEnvio.updateMany.mockResolvedValue({ count: 3 });
    const n = await filaRepository.cancelarDoLote('b1', 'L1', 'Campanha cancelada');
    expect(db.whatsappEnvio.updateMany).toHaveBeenCalledWith({
      where: { businessId: 'b1', batchId: 'L1', status: 'na_fila' },
      data: { status: 'cancelado', reason: 'Campanha cancelada' },
    });
    expect(n).toBe(3);
  });
  it('contagemDoLote devolve todos os status, com zero nos que faltam', async () => {
    db.whatsappEnvio.groupBy.mockResolvedValue([
      { batchId: 'L1', status: 'enviado', _count: { _all: 2 } },
      { batchId: 'L1', status: 'na_fila', _count: { _all: 5 } },
    ]);
    const m = await filaRepository.contagemDoLote('b1', ['L1', 'L2']);
    expect(db.whatsappEnvio.groupBy.mock.calls[0][0].where).toEqual({ businessId: 'b1', batchId: { in: ['L1', 'L2'] } });
    expect(m.get('L1')).toEqual({ na_fila: 5, enviando: 0, enviado: 2, falhou: 0, pulado: 0, cancelado: 0 });
    expect(m.get('L2')).toEqual({ na_fila: 0, enviando: 0, enviado: 0, falhou: 0, pulado: 0, cancelado: 0 });
  });
  it('itensDoLote filtra por negócio e lote, traz o nome da cliente e ordena pela criação', async () => {
    db.whatsappEnvio.findMany.mockResolvedValue([]);
    await filaRepository.itensDoLote('b1', 'L1');
    expect(db.whatsappEnvio.findMany).toHaveBeenCalledWith({
      where: { businessId: 'b1', batchId: 'L1' },
      include: { client: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  });
});
