import { it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ whatsappEnvio: { findMany: vi.fn() }, appointment: { updateMany: vi.fn() } }));
vi.mock('../config/prisma.js', () => ({ prisma: db }));

const { rotinasRepository } = await import('../modules/whatsappAutomacoes/rotinas.repository.js');

beforeEach(() => vi.clearAllMocks());

it('clientesComEnvioDesde ignora envios que falharam ou foram pulados (aniversário pode tentar de novo)', async () => {
  db.whatsappEnvio.findMany.mockResolvedValue([{ clientId: 'c1' }]);
  const desde = new Date('2026-01-01T03:00:00Z');
  expect(await rotinasRepository.clientesComEnvioDesde('b1', 'aniversario', desde, ['c1', 'c2'])).toEqual(new Set(['c1']));
  expect(db.whatsappEnvio.findMany.mock.calls[0][0].where).toEqual({
    businessId: 'b1', origin: 'aniversario', createdAt: { gte: desde }, clientId: { in: ['c1', 'c2'] },
    status: { notIn: ['falhou', 'pulado'] },
  });
});

it('marcarLembreteEnviado só grava quem ainda não estava marcado', async () => {
  db.appointment.updateMany.mockResolvedValue({ count: 0 });
  expect(await rotinasRepository.marcarLembreteEnviado('b1', 'a1')).toBe(false);
  expect(db.appointment.updateMany).toHaveBeenCalledWith({ where: { id: 'a1', businessId: 'b1', reminderSent: false }, data: { reminderSent: true } });
});
