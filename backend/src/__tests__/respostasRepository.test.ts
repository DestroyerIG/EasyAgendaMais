import { it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  whatsappRespostaPendente: { deleteMany: vi.fn((a) => ({ op: 'deleteMany', a })), create: vi.fn((a) => ({ op: 'create', a })) },
  whatsappMessage: { count: vi.fn() },
  whatsappRating: { create: vi.fn(), upsert: vi.fn() },
}));
vi.mock('../config/prisma.js', () => ({ prisma: db }));

const { respostasRepository } = await import('../modules/whatsappAutomacoes/respostas.repository.js');

beforeEach(() => vi.clearAllMocks());

it('registrar apaga só a espera do mesmo tipo (avaliação nova não apaga confirmação pendente)', async () => {
  await respostasRepository.registrar({ businessId: 'b1', phoneKey: 'k', tipo: 'avaliacao', appointmentId: 'a1', expiresAt: new Date() });
  expect(db.whatsappRespostaPendente.deleteMany).toHaveBeenCalledWith({ where: { businessId: 'b1', phoneKey: 'k', tipo: 'avaliacao' } });
});

it('houveSaidaDepois: saída do número depois da espera, ignorando confirmação/avaliação/lembrete e nota do painel', async () => {
  const desde = new Date('2026-10-22T12:00:00Z');
  db.whatsappMessage.count.mockResolvedValue(1);
  expect(await respostasRepository.houveSaidaDepois('b1', 'k', desde)).toBe(true);
  expect(db.whatsappMessage.count.mock.calls[0][0].where).toEqual({
    businessId: 'b1', phoneKey: 'k', direction: 'out', createdAt: { gt: desde },
    origin: { notIn: ['confirmacao', 'avaliacao', 'lembrete', 'painel_evento'] },
  });
  db.whatsappMessage.count.mockResolvedValue(0);
  expect(await respostasRepository.houveSaidaDepois('b1', 'k', desde)).toBe(false);
});

it('salvarNota usa create e não sobrescreve nota já gravada (P2002 é ignorado)', async () => {
  const erro = Object.assign(new Error('unique'), { code: 'P2002' });
  db.whatsappRating.create.mockRejectedValueOnce(erro);
  await expect(respostasRepository.salvarNota({ businessId: 'b1', appointmentId: 'a1', rating: 5 })).resolves.toBe(false);
  expect(db.whatsappRating.create).toHaveBeenCalledWith({ data: { businessId: 'b1', appointmentId: 'a1', rating: 5 } });
  expect(db.whatsappRating.upsert).not.toHaveBeenCalled();
});

it('salvarNota devolve true quando grava a nota nova', async () => {
  db.whatsappRating.create.mockResolvedValueOnce({});
  await expect(respostasRepository.salvarNota({ businessId: 'b1', appointmentId: 'a1', rating: 5 })).resolves.toBe(true);
});

it('salvarNota repassa erros que não são P2002', async () => {
  db.whatsappRating.create.mockRejectedValueOnce(new Error('queda'));
  await expect(respostasRepository.salvarNota({ businessId: 'b1', appointmentId: 'a1', rating: 5 })).rejects.toThrow('queda');
});
