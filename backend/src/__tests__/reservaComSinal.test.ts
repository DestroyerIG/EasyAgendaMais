import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reservaComSinalService, type EntradaReservaComSinal } from '../modules/recebimentos/reservaComSinal.service.js';
import { publicBookingRepository } from '../modules/publicBooking/publicBooking.repository.js';
import { appointmentsPrismaRepository } from '../modules/appointments/appointments.repository.js';
import { conexaoService } from '../modules/recebimentos/conexao.service.js';
import { cobrancasService } from '../modules/recebimentos/cobrancas.service.js';
import { ConflictError } from '../utils/errors.js';

vi.mock('../modules/whatsappAutomacoes/gatilhos.service.js', () => ({
  automacoesGatilhos: { toleranciaSinal: vi.fn().mockResolvedValue(20) },
}));
vi.mock('../modules/publicBooking/publicBooking.repository.js', () => ({
  publicBookingRepository: { createPendingAppointment: vi.fn(), withProfessionalDayLock: vi.fn() },
}));
vi.mock('../modules/appointments/appointments.repository.js', () => ({
  appointmentsPrismaRepository: { hasConflict: vi.fn() },
}));
vi.mock('../modules/recebimentos/conexao.service.js', () => ({
  conexaoService: { formas: vi.fn(), cartaoForaDoAr: vi.fn() },
}));
vi.mock('../modules/recebimentos/cobrancas.service.js', () => ({ cobrancasService: { criar: vi.fn() } }));

const fn = (x: unknown) => x as ReturnType<typeof vi.fn>;

const ENTRADA: EntradaReservaComSinal = {
  business: { id: 'biz-1', name: 'Studio Aurora', slug: 'aurora', pixKey: 'studio@aurora.com', pixKeyType: 'email' },
  clientId: 'cli-1', professionalId: 'pro-1', serviceId: 'srv-1',
  serviceName: 'Corte', servicePrice: 80, depositPercentage: 25,
  date: '2026-12-01', time: '10:00', origem: 'whatsapp',
};

beforeEach(() => {
  vi.clearAllMocks();
  fn(conexaoService.formas).mockResolvedValue(['pix']);
  fn(conexaoService.cartaoForaDoAr).mockResolvedValue(false);
  fn(appointmentsPrismaRepository.hasConflict).mockResolvedValue(false);
  fn(publicBookingRepository.withProfessionalDayLock).mockImplementation(async (_p: string, _d: string, cb: (tx: unknown) => unknown) => cb('tx'));
  fn(publicBookingRepository.createPendingAppointment).mockResolvedValue({ id: 'apt-1' });
  fn(cobrancasService.criar).mockResolvedValue(null);
});

describe('reservaComSinalService.criar', () => {
  it('usa a primeira forma liberada quando formaPedida não vem', async () => {
    fn(conexaoService.formas).mockResolvedValue(['cartao']);
    fn(cobrancasService.criar).mockResolvedValue({ pixPayload: null, checkoutUrl: 'https://pay/x' });
    const r = await reservaComSinalService.criar(ENTRADA);
    expect(fn(cobrancasService.criar).mock.calls[0][0]).toMatchObject({ forma: 'cartao', slug: 'aurora' });
    expect(r).toMatchObject({ forma: 'cartao', automatica: true, pixPayload: null, checkoutUrl: 'https://pay/x', cartaoIndisponivel: false });
  });

  it('cria a reserva aguardando_pagamento com source da origem, expiresAt na tolerância e depositAmount', async () => {
    const antes = Date.now();
    const r = await reservaComSinalService.criar(ENTRADA);
    const dados = fn(publicBookingRepository.createPendingAppointment).mock.calls[0];
    expect(dados[0]).toMatchObject({
      businessId: 'biz-1', clientId: 'cli-1', professionalId: 'pro-1', serviceId: 'srv-1',
      date: '2026-12-01', time: '10:00', depositAmount: 20, source: 'whatsapp',
    });
    expect(dados[1]).toBe('tx');
    expect(r.depositAmount).toBe(20);
    expect(r.toleranciaMin).toBe(20);
    expect(r.expiresAt.getTime()).toBeGreaterThanOrEqual(antes + 20 * 60 * 1000);
    expect(r.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 20 * 60 * 1000);
    expect(r.appointment).toEqual({ id: 'apt-1' });
  });

  it('sem gateway devolve o Pix manual', async () => {
    fn(conexaoService.formas).mockResolvedValue([]);
    const r = await reservaComSinalService.criar(ENTRADA);
    expect(cobrancasService.criar).not.toHaveBeenCalled();
    expect(r).toMatchObject({ forma: 'pix', automatica: false, checkoutUrl: null, cartaoIndisponivel: false });
    expect(r.pixPayload).toMatch(/^000201/);
  });

  it('cartão pedido cuja cobrança falha cai no Pix manual com cartaoIndisponivel true', async () => {
    fn(conexaoService.formas).mockResolvedValue(['pix', 'cartao']);
    fn(cobrancasService.criar).mockResolvedValue(null);
    const r = await reservaComSinalService.criar({ ...ENTRADA, formaPedida: 'cartao' });
    expect(r).toMatchObject({ forma: 'pix', automatica: false, cartaoIndisponivel: true });
    expect(r.pixPayload).toMatch(/^000201/);
  });

  it('conflito dentro da trava lança ConflictError e não cria cobrança', async () => {
    fn(appointmentsPrismaRepository.hasConflict).mockResolvedValue(true);
    await expect(reservaComSinalService.criar(ENTRADA)).rejects.toThrow(ConflictError);
    expect(publicBookingRepository.createPendingAppointment).not.toHaveBeenCalled();
    expect(cobrancasService.criar).not.toHaveBeenCalled();
  });
});
