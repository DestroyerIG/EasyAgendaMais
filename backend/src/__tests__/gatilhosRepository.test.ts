import { it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ waitlistEntry: { findMany: vi.fn(), updateMany: vi.fn() } }));
vi.mock('../config/prisma.js', () => ({ prisma: db }));

const { gatilhosRepository } = await import('../modules/whatsappAutomacoes/gatilhos.repository.js');

beforeEach(() => vi.clearAllMocks());

const AGORA = new Date('2026-10-22T15:00:00Z');
const LIMITE = new Date('2026-10-21T15:00:00Z');

const linha = (id: string, consents: Array<{ granted: boolean; revokedAt: Date | null }>, o: Record<string, unknown> = {}) => ({
  id, clientId: `c${id}`, status: 'aguardando', offeredAt: null, createdAt: new Date('2026-10-01T00:00:00Z'), ...o, serviceId: 's1', professionalId: null, desiredDate: null, period: 'qualquer',
  client: { name: 'Ana', phone: '83999990000', consents }, service: { durationMinutes: 60 },
});

it('entradasCandidatas traz o consentimento de lembretes mais recente', async () => {
  db.waitlistEntry.findMany.mockResolvedValue([
    linha('1', []),
    linha('2', [{ granted: true, revokedAt: null }]),
    linha('3', [{ granted: true, revokedAt: new Date() }]),
    linha('4', [{ granted: false, revokedAt: null }]),
  ]);
  const r = await gatilhosRepository.entradasCandidatas('b1', AGORA);
  expect(r.map((e) => e.consentimentoRevogado)).toEqual([false, false, true, true]);
  const consents = db.waitlistEntry.findMany.mock.calls[0][0].include.client.select.consents;
  expect(consents).toMatchObject({ where: { kind: 'whatsapp_lembretes' }, orderBy: { grantedAt: 'desc' }, take: 1 });
});

it('candidatas: aguardando e oferecidas há mais de 24h; aguardando primeiro, depois as ofertas mais antigas', async () => {
  db.waitlistEntry.findMany.mockResolvedValue([
    linha('o2', [], { status: 'oferecida', offeredAt: new Date('2026-10-20T10:00:00Z'), createdAt: new Date('2026-09-01T00:00:00Z') }),
    linha('a1', [], { createdAt: new Date('2026-10-05T00:00:00Z') }),
    linha('o1', [], { status: 'oferecida', offeredAt: new Date('2026-10-18T10:00:00Z'), createdAt: new Date('2026-10-10T00:00:00Z') }),
    linha('a2', [], { createdAt: new Date('2026-10-06T00:00:00Z') }),
  ]);
  const r = await gatilhosRepository.entradasCandidatas('b1', AGORA);
  expect(r.map((e) => e.id)).toEqual(['a1', 'a2', 'o1', 'o2']);
  expect(db.waitlistEntry.findMany.mock.calls[0][0].where).toEqual({
    businessId: 'b1',
    OR: [{ status: 'aguardando' }, { status: 'oferecida', offeredAt: { lt: LIMITE } }],
  });
});

it('marcarOferecida reserva aguardando ou oferta vencida (compare-and-set)', async () => {
  db.waitlistEntry.updateMany.mockResolvedValue({ count: 1 });
  expect(await gatilhosRepository.marcarOferecida('e1', 'b1', AGORA)).toBe(true);
  expect(db.waitlistEntry.updateMany).toHaveBeenCalledWith({
    where: { id: 'e1', businessId: 'b1', OR: [{ status: 'aguardando' }, { status: 'oferecida', offeredAt: { lt: LIMITE } }] },
    data: { status: 'oferecida', offeredAt: AGORA },
  });
});
