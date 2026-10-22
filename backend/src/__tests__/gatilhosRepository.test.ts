import { it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ waitlistEntry: { findMany: vi.fn() } }));
vi.mock('../config/prisma.js', () => ({ prisma: db }));

const { gatilhosRepository } = await import('../modules/whatsappAutomacoes/gatilhos.repository.js');

beforeEach(() => vi.clearAllMocks());

const linha = (id: string, consents: Array<{ granted: boolean; revokedAt: Date | null }>) => ({
  id, clientId: `c${id}`, serviceId: 's1', professionalId: null, desiredDate: null, period: 'qualquer',
  client: { name: 'Ana', phone: '83999990000', consents }, service: { durationMinutes: 60 },
});

it('entradasAguardando traz o consentimento de lembretes mais recente', async () => {
  db.waitlistEntry.findMany.mockResolvedValue([
    linha('1', []),
    linha('2', [{ granted: true, revokedAt: null }]),
    linha('3', [{ granted: true, revokedAt: new Date() }]),
    linha('4', [{ granted: false, revokedAt: null }]),
  ]);
  const r = await gatilhosRepository.entradasAguardando('b1');
  expect(r.map((e) => e.consentimentoRevogado)).toEqual([false, false, true, true]);
  const consents = db.waitlistEntry.findMany.mock.calls[0][0].include.client.select.consents;
  expect(consents).toMatchObject({ where: { kind: 'whatsapp_lembretes' }, orderBy: { grantedAt: 'desc' }, take: 1 });
});
