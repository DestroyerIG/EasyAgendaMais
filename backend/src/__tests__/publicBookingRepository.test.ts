import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '../config/prisma.js';
import { publicBookingRepository } from '../modules/publicBooking/publicBooking.repository.js';
import { clientRepository } from '../repositories/clientRepository.js';

const txExecuteRaw = vi.hoisted(() => vi.fn());
const fakeTx = vi.hoisted(() => ({ $executeRaw: txExecuteRaw, appointment: { create: vi.fn(), findFirst: vi.fn() } }));

vi.mock('../config/prisma.js', () => ({
  prisma: {
    business: { findFirst: vi.fn() },
    service: { findFirst: vi.fn(), findMany: vi.fn() },
    professional: { findFirst: vi.fn(), findMany: vi.fn() },
    appointment: { create: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(fakeTx)),
  },
}));

vi.mock('../repositories/clientRepository.js', () => ({
  clientRepository: {
    findByPhone: vi.fn(),
    create: vi.fn(),
  },
}));

describe('publicBookingRepository — exclusão de sinal 0%', () => {
  beforeEach(() => vi.clearAllMocks());

  it('findEligibleServices filtra depositPercentage com gt: 0 (exclui null e 0%)', async () => {
    (prisma.service.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await publicBookingRepository.findEligibleServices('biz-1');

    const whereArg = (prisma.service.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
    expect(whereArg.depositPercentage).toEqual({ gt: 0 });
  });

  it('findServiceForBusiness filtra depositPercentage com gt: 0 (exclui null e 0%)', async () => {
    (prisma.service.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await publicBookingRepository.findServiceForBusiness('biz-1', 'srv-1');

    const whereArg = (prisma.service.findFirst as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
    expect(whereArg.depositPercentage).toEqual({ gt: 0 });
  });
});

describe('publicBookingRepository.withProfessionalDayLock — advisory lock', () => {
  beforeEach(() => vi.clearAllMocks());

  // Limitação: com o prisma mockado não dá para reproduzir uma corrida real entre
  // duas conexões do Postgres. Este teste garante a parte verificável sem banco:
  // tudo roda dentro de $transaction e o pg_advisory_xact_lock (com chave
  // determinística profissional|data) é executado ANTES do callback que faz a
  // checagem de conflito e a criação. A serialização em si é garantia do Postgres.
  it('adquire pg_advisory_xact_lock(hashtext(profissional|data)) na transação antes de executar o callback', async () => {
    const order: string[] = [];
    txExecuteRaw.mockImplementation(async () => { order.push('lock'); return 1; });

    const result = await publicBookingRepository.withProfessionalDayLock('prof-1', '2099-10-24', async (tx) => {
      order.push('callback');
      expect(tx).toBe(fakeTx);
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['lock', 'callback']);

    const [strings, ...values] = txExecuteRaw.mock.calls[0];
    expect((strings as string[]).join('?')).toContain('pg_advisory_xact_lock(hashtext(');
    expect(values).toEqual(['prof-1|2099-10-24']);
  });

  it('propaga o erro do callback (a transação aborta e o lock é liberado pelo Postgres)', async () => {
    txExecuteRaw.mockResolvedValue(1);
    await expect(
      publicBookingRepository.withProfessionalDayLock('prof-1', '2099-10-24', async () => {
        throw new Error('conflito');
      })
    ).rejects.toThrow('conflito');
  });

  it('createPendingAppointment usa o cliente da transação quando informado', async () => {
    fakeTx.appointment.create.mockResolvedValue({ id: 'appt-1' });
    await publicBookingRepository.createPendingAppointment({
      businessId: 'biz-1', clientId: 'c-1', professionalId: 'prof-1', serviceId: 'srv-1',
      date: '2099-10-24', time: '14:00', expiresAt: new Date(),
    }, fakeTx as never);
    expect(fakeTx.appointment.create).toHaveBeenCalledTimes(1);
    expect(prisma.appointment.create).not.toHaveBeenCalled();
  });
});

describe('publicBookingRepository.findOrCreateClient — normalização do telefone', () => {
  beforeEach(() => vi.clearAllMocks());

  it('"(83) 99999-0000", "83999990000" e "+55 83 99999-0000" buscam o mesmo telefone normalizado', async () => {
    (clientRepository.findByPhone as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'client-1' });

    for (const phone of ['(83) 99999-0000', '83999990000', '+55 83 99999-0000']) {
      const result = await publicBookingRepository.findOrCreateClient('biz-1', 'Mariana', phone);
      expect(result).toEqual({ id: 'client-1' });
    }

    const searched = (clientRepository.findByPhone as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[1]);
    expect(searched).toEqual(['5583999990000', '5583999990000', '5583999990000']);
    expect(clientRepository.create).not.toHaveBeenCalled();
  });

  it('cria o cliente com o telefone normalizado quando não existe', async () => {
    (clientRepository.findByPhone as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (clientRepository.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'client-2' });

    await publicBookingRepository.findOrCreateClient('biz-1', 'Mariana', '(83) 99999-0000');

    expect((clientRepository.create as ReturnType<typeof vi.fn>).mock.calls[0][0].phone).toBe('5583999990000');
  });
});
