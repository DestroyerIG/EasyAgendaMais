import { describe, it, expect, vi, beforeEach } from 'vitest';

// Cobrança de saldo (balcão) e de sinal (reserva online) moram na mesma tabela: as consultas do
// sinal precisam filtrar `tipo`, e as do saldo têm ciclo próprio.

const db = vi.hoisted(() => {
  const d: Record<string, unknown> = {
    cobrancaSinal: {
      findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), count: vi.fn(), create: vi.fn(), findUnique: vi.fn(), aggregate: vi.fn(), update: vi.fn(),
    },
    appointment: { updateMany: vi.fn() },
  };
  d['$transaction'] = async (fn: (tx: unknown) => unknown) => fn(d);
  return d as { cobrancaSinal: Record<string, ReturnType<typeof vi.fn>>; appointment: Record<string, ReturnType<typeof vi.fn>> };
});
vi.mock('../config/prisma.js', () => ({ prisma: db }));
vi.mock('../utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../modules/appointments/appointments.repository.js', () => ({
  appointmentsPrismaRepository: { hasConflict: vi.fn().mockResolvedValue(false), findById: vi.fn() },
}));
vi.mock('../modules/publicBooking/publicBooking.repository.js', () => ({
  publicBookingRepository: { withProfessionalDayLock: async (_p: string, _d: string, fn: (tx: unknown) => unknown) => fn(db) },
}));
const notif = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('../modules/notifications/notifications.service.js', () => ({ notificationsService: notif }));
vi.mock('../services/scheduleSettingsService.js', () => ({ getBusinessScheduleSettings: vi.fn().mockResolvedValue({ timezone: 'America/Sao_Paulo' }) }));

const { recebimentosRepository: repo } = await import('../modules/recebimentos/recebimentos.repository.js');

const cs = db.cobrancaSinal;
const onde = (fn: ReturnType<typeof vi.fn>) => (fn.mock.calls[0]![0] as { where: Record<string, unknown> }).where;

beforeEach(() => {
  vi.clearAllMocks();
  cs.findMany.mockResolvedValue([]);
  cs.updateMany.mockResolvedValue({ count: 0 });
  cs.count.mockResolvedValue(0);
  db.appointment.updateMany.mockResolvedValue({ count: 1 });
});

describe('consultas do sinal ignoram o saldo', () => {
  it('reservasComSinalNoCartao', async () => {
    await repo.reservasComSinalNoCartao('b1', ['a1']);
    expect(onde(cs.findMany)).toMatchObject({ tipo: 'sinal' });
  });

  it('reservasComCobrancaPendente', async () => {
    await repo.reservasComCobrancaPendente('b1', ['a1']);
    expect(onde(cs.findMany)).toMatchObject({ tipo: 'sinal' });
  });

  it('reservasPendentes', async () => {
    await repo.reservasPendentes('b1');
    expect(onde(cs.count)).toMatchObject({ tipo: 'sinal' });
  });

  it('marcarSubstituidas', async () => {
    await repo.marcarSubstituidas('a1', 'infinitepay');
    expect(onde(cs.updateMany)).toMatchObject({ tipo: 'sinal' });
  });

  it('cobrancasDaReserva', async () => {
    await repo.cobrancasDaReserva('a1');
    expect(onde(cs.findMany)).toMatchObject({ tipo: 'sinal' });
  });

  it('outraCobrancaPaga: um saldo pago não faz o sinal parecer pago em dobro', async () => {
    await repo.outraCobrancaPaga('a1', 'c1');
    expect(onde(cs.count)).toMatchObject({ tipo: 'sinal' });
  });

  it('expirarReserva só expira cobranças de sinal', async () => {
    await repo.expirarReserva('a1', new Date());
    expect(onde(cs.updateMany)).toMatchObject({ tipo: 'sinal' });
  });

  it('lembrarDevolucaoAoCancelar só olha sinais pagos', async () => {
    await repo.lembrarDevolucaoAoCancelar('b1', 'a1');
    expect(onde(cs.findMany)).toMatchObject({ tipo: 'sinal' });
  });

  it('marcarPagaEReativar só recusa as irmãs de sinal', async () => {
    cs.findUnique
      .mockResolvedValueOnce({ appointment: { businessId: 'b1', professionalId: 'p1', date: new Date('2030-01-01') } })
      .mockResolvedValueOnce({ situacao: 'expirada', appointment: { id: 'a1', status: 'cancelado', time: new Date('1970-01-01T10:00:00Z') } });
    cs.updateMany.mockResolvedValue({ count: 1 });
    const r = await repo.marcarPagaEReativar('c1', { id: 'p9', status: 'approved', valor: 30, referencia: 'c1', formaPaga: 'pix' });
    expect(r).toBe('reativada');
    const irmas = cs.updateMany.mock.calls.map((c) => c[0] as { where: Record<string, unknown> }).find((c) => c.where['situacao'] === 'expirada');
    expect(irmas?.where).toMatchObject({ tipo: 'sinal' });
  });
});

describe('pagamento repetido de saldo', () => {
  it('registrarPagamentoRepetido grava a linha com o tipo da cobrança', async () => {
    cs.create.mockResolvedValue({});
    await repo.registrarPagamentoRepetido(
      { businessId: 'b1', appointmentId: 'a1', gateway: 'mercadopago', forma: 'pix', valor: '80.00', tipo: 'saldo' },
      { id: 'p2', status: 'approved', valor: 80, referencia: 'c1', formaPaga: 'pix' },
    );
    expect(cs.create.mock.calls[0]![0].data).toMatchObject({ tipo: 'saldo' });
  });
});

describe('cobranças de saldo no repositório', () => {
  it('criarCobrancaSaldo grava a linha pendente do tipo saldo, com quem iniciou', async () => {
    cs.create.mockResolvedValue({ id: 'c1' });
    const venceEm = new Date('2030-01-01T10:15:00Z');
    const r = await repo.criarCobrancaSaldo({ businessId: 'b1', appointmentId: 'a1', usuarioId: 'u1', gateway: 'mercadopago', valor: 80, venceEm });
    expect(r).toEqual({ id: 'c1' });
    expect(cs.create.mock.calls[0]![0].data).toEqual({
      businessId: 'b1', appointmentId: 'a1', usuarioId: 'u1', gateway: 'mercadopago', tipo: 'saldo', forma: 'pix',
      valor: '80.00', situacao: 'pendente', venceEm,
    });
  });

  it('cobrancaSaldoPendente só vale para pendente ainda dentro do prazo', async () => {
    const agora = new Date('2030-01-01T10:00:00Z');
    cs.count.mockResolvedValueOnce(1);
    expect(await repo.cobrancaSaldoPendente('a1', agora)).toBe(true);
    expect(onde(cs.count)).toEqual({ appointmentId: 'a1', tipo: 'saldo', situacao: 'pendente', venceEm: { gt: agora } });
    cs.count.mockResolvedValueOnce(0);
    expect(await repo.cobrancaSaldoPendente('a1', agora)).toBe(false);
  });

  it('ultimaCobrancaSaldo pega a mais nova do tipo saldo', async () => {
    cs.findFirst.mockResolvedValue({ id: 'c9' });
    expect(await repo.ultimaCobrancaSaldo('a1')).toEqual({ id: 'c9' });
    const arg = cs.findFirst.mock.calls[0]![0] as { where: unknown; orderBy: unknown };
    expect(arg.where).toEqual({ appointmentId: 'a1', tipo: 'saldo' });
    expect(arg.orderBy).toEqual({ criadoEm: 'desc' });
  });

  it('substituirSaldoPendente e cancelarSaldoPendente só mexem em saldo pendente', async () => {
    await repo.substituirSaldoPendente('a1');
    expect(cs.updateMany.mock.calls[0]![0]).toEqual({
      where: { appointmentId: 'a1', tipo: 'saldo', situacao: 'pendente' }, data: { situacao: 'substituida' },
    });
    cs.updateMany.mockResolvedValueOnce({ count: 2 });
    expect(await repo.cancelarSaldoPendente('a1')).toBe(2);
    expect(cs.updateMany.mock.calls[1]![0]).toEqual({
      where: { appointmentId: 'a1', tipo: 'saldo', situacao: 'pendente' }, data: { situacao: 'cancelada' },
    });
  });

  it('expirarSaldosVencidos marca só saldo pendente vencido antes do limite', async () => {
    const limite = new Date('2030-01-01T10:00:00Z');
    cs.updateMany.mockResolvedValueOnce({ count: 3 });
    expect(await repo.expirarSaldosVencidos(limite)).toBe(3);
    expect(cs.updateMany.mock.calls[0]![0]).toEqual({
      where: { tipo: 'saldo', situacao: 'pendente', venceEm: { lt: limite } }, data: { situacao: 'expirada' },
    });
  });
});
