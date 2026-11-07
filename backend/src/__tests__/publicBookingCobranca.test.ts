import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { publicBookingService } from '../modules/publicBooking/publicBooking.service.js';
import { publicBookingRepository } from '../modules/publicBooking/publicBooking.repository.js';
import { appointmentsPrismaRepository } from '../modules/appointments/appointments.repository.js';
import { recebimentosRepository } from '../modules/recebimentos/recebimentos.repository.js';
import { conexaoService } from '../modules/recebimentos/conexao.service.js';
import { automacoesGatilhos } from '../modules/whatsappAutomacoes/gatilhos.service.js';
import { gateways, GatewayIndisponivel, GatewayRecusou, GatewayTokenInvalido } from '../modules/recebimentos/gateways/index.js';
import { CreatePublicAppointmentSchema } from '../modules/publicBooking/publicBooking.types.js';
import { generateAvailableTimeSlots, getBusinessScheduleSettings } from '../services/scheduleSettingsService.js';
import { ConflictError, ValidationError } from '../utils/errors.js';

vi.mock('../modules/conta/estadoConta.service.js', () => ({ estadoContaService: { doNegocio: vi.fn().mockResolvedValue({ tipo: 'ativa' }) } }));
vi.mock('../modules/whatsappAutomacoes/gatilhos.service.js', () => ({
  automacoesGatilhos: { aoCriarReservaComSinal: vi.fn().mockResolvedValue(true), toleranciaSinal: vi.fn().mockResolvedValue(15) },
}));
vi.mock('../modules/notifications/notifications.service.js', () => ({ notificationsService: { notify: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('../modules/googleAgenda/googleAgenda.service.js', () => ({
  googleAgendaService: { bloqueiosDoDia: vi.fn().mockResolvedValue([]), sincronizarSaida: vi.fn() },
}));
vi.mock('../modules/publicBooking/publicBooking.repository.js', () => ({
  publicBookingRepository: {
    findBusinessBySlug: vi.fn(), findServiceForBusiness: vi.fn(), findProfessionalForBusiness: vi.fn(),
    findOrCreateClient: vi.fn(), createPendingAppointment: vi.fn(), withProfessionalDayLock: vi.fn(),
    findPublicAppointment: vi.fn(), findEligibleServices: vi.fn(), resumoDasNotas: vi.fn(),
  },
}));
vi.mock('../modules/appointments/appointments.repository.js', () => ({
  appointmentsPrismaRepository: { hasConflict: vi.fn(), getBookedSlots: vi.fn(), getProfessionalBreak: vi.fn().mockResolvedValue(null) },
}));
vi.mock('../services/scheduleSettingsService.js', () => ({
  getBusinessScheduleSettings: vi.fn(), generateAvailableTimeSlots: vi.fn(), closesTodayAt: vi.fn().mockReturnValue(null),
}));
vi.mock('../modules/recebimentos/recebimentos.repository.js', () => ({
  recebimentosRepository: {
    criarCobranca: vi.fn(), completarCobranca: vi.fn(), apagarCobranca: vi.fn(), cobrancasDaReserva: vi.fn(),
  },
}));
vi.mock('../modules/recebimentos/conexao.service.js', () => ({
  conexaoService: { formas: vi.fn(), tokenAtivo: vi.fn(), alertarRecusa: vi.fn(), marcarReconectar: vi.fn(), acessoRevogado: vi.fn() },
}));
vi.mock('../modules/recebimentos/gateways/index.js', async (original) => ({
  ...(await original<typeof import('../modules/recebimentos/gateways/index.js')>()),
  gateways: { mercadopago: { criarPix: vi.fn(), criarCheckoutCartao: vi.fn() } },
}));

const fn = (x: unknown) => x as ReturnType<typeof vi.fn>;
const pubRepo = publicBookingRepository as unknown as Record<string, ReturnType<typeof vi.fn>>;
const recRepo = recebimentosRepository as unknown as Record<string, ReturnType<typeof vi.fn>>;
const gw = gateways.mercadopago as unknown as Record<string, ReturnType<typeof vi.fn>>;

const BUSINESS = { id: 'biz-1', name: 'Studio Aurora', pixKey: 'studio@aurora.com', pixKeyType: 'email' };
const SERVICE = { id: 'srv-1', name: 'Corte', price: 100, durationMinutes: 60, depositPercentage: 30 };
const INPUT = {
  serviceId: 'srv-1', professionalId: 'prof-1', date: '2099-10-24', time: '14:00', clientName: 'Maria', clientPhone: '83999990000',
};
const TOKEN = { gateway: 'mercadopago', accessToken: 'tok' };
const MANUAL_PIX = expect.stringContaining('000201');

let lockTerminou = false;

beforeEach(() => {
  vi.clearAllMocks();
  lockTerminou = false;
  process.env.FRONTEND_URL = 'https://www.easybarber.com.br';
  pubRepo.findBusinessBySlug.mockResolvedValue(BUSINESS);
  pubRepo.findServiceForBusiness.mockResolvedValue(SERVICE);
  pubRepo.findProfessionalForBusiness.mockResolvedValue({ id: 'prof-1' });
  pubRepo.findOrCreateClient.mockResolvedValue({ id: 'c1' });
  pubRepo.withProfessionalDayLock.mockImplementation(async (_p: string, _d: string, f: (tx: unknown) => Promise<unknown>) => {
    const r = await f({});
    lockTerminou = true;
    return r;
  });
  pubRepo.createPendingAppointment.mockResolvedValue({ id: 'appt-1', client: { name: 'Maria', phone: '83999990000' }, service: { name: 'Corte', price: 100 } });
  fn(getBusinessScheduleSettings).mockResolvedValue({});
  fn(generateAvailableTimeSlots).mockReturnValue(['14:00']);
  fn(appointmentsPrismaRepository.getBookedSlots).mockResolvedValue([]);
  fn(appointmentsPrismaRepository.hasConflict).mockResolvedValue(false);
  fn(conexaoService.formas).mockResolvedValue(['pix', 'cartao']);
  fn(conexaoService.tokenAtivo).mockResolvedValue(TOKEN);
  recRepo.criarCobranca.mockImplementation(async () => {
    expect(lockTerminou).toBe(true);
    return { id: 'cob-1' };
  });
  recRepo.apagarCobranca.mockResolvedValue(undefined);
  gw.criarPix.mockResolvedValue({ idExterno: 'ord-1', codigoPix: 'PIX-DO-GATEWAY' });
  gw.criarCheckoutCartao.mockResolvedValue({ idExterno: 'pref-1', checkoutUrl: 'https://mp.test/checkout' });
});

afterEach(() => { delete process.env.FRONTEND_URL; });

describe('criação da reserva com cobrança', () => {
  it('sem conexão: igual a hoje, com código manual e automatica false', async () => {
    fn(conexaoService.formas).mockResolvedValue(['pix']);
    fn(conexaoService.tokenAtivo).mockResolvedValue(null);
    const r = await publicBookingService.createPendingAppointment('studio', INPUT);
    expect(r).toMatchObject({ pixPayload: MANUAL_PIX, checkoutUrl: null, forma: 'pix', automatica: false, cartaoIndisponivel: false });
    expect(recRepo.criarCobranca).not.toHaveBeenCalled();
    expect(automacoesGatilhos.aoCriarReservaComSinal).toHaveBeenCalledWith('biz-1', 'appt-1', expect.objectContaining({ pixPayload: r.pixPayload }));
  });

  it('com conexão e Pix: código do gateway, automática, cobrança pendente com o vencimento da reserva', async () => {
    const r = await publicBookingService.createPendingAppointment('studio', INPUT);
    expect(r).toMatchObject({ pixPayload: 'PIX-DO-GATEWAY', checkoutUrl: null, forma: 'pix', automatica: true, cartaoIndisponivel: false });
    expect(recRepo.criarCobranca).toHaveBeenCalledWith(expect.objectContaining({
      businessId: 'biz-1', appointmentId: 'appt-1', gateway: 'mercadopago', forma: 'pix', valor: 30, venceEm: new Date(r.expiresAt),
    }));
    expect(recRepo.completarCobranca).toHaveBeenCalledWith('cob-1', { idExterno: 'ord-1', codigoPix: 'PIX-DO-GATEWAY' });
    expect(gw.criarPix).toHaveBeenCalledWith('tok', expect.objectContaining({
      cobrancaId: 'cob-1', valor: 30, descricao: 'Sinal - Corte', pagadorEmail: 'reserva-cob-1@easybarber.com.br',
    }));
    expect(automacoesGatilhos.aoCriarReservaComSinal).toHaveBeenCalledWith('biz-1', 'appt-1', expect.objectContaining({ pixPayload: 'PIX-DO-GATEWAY' }));
  });

  it('com conexão e cartão: checkoutUrl, sem Pix e sem WhatsApp com código', async () => {
    const r = await publicBookingService.createPendingAppointment('studio', { ...INPUT, formaPagamento: 'cartao' });
    expect(r).toMatchObject({ pixPayload: null, checkoutUrl: 'https://mp.test/checkout', forma: 'cartao', automatica: true, cartaoIndisponivel: false });
    expect(automacoesGatilhos.aoCriarReservaComSinal).not.toHaveBeenCalled();
    expect(gw.criarPix).not.toHaveBeenCalled();
  });

  it('voltas do Checkout levam à página da reserva', async () => {
    await publicBookingService.createPendingAppointment('studio', { ...INPUT, formaPagamento: 'cartao' });
    const base = 'https://www.easybarber.com.br/agendar/studio?reserva=appt-1&retorno=';
    expect(gw.criarCheckoutCartao).toHaveBeenCalledWith('tok', expect.anything(), {
      sucesso: `${base}sucesso`, pendente: `${base}pendente`, falha: `${base}falha`,
    });
  });

  it('sem domínio utilizável, o e-mail do pagador usa localhost', async () => {
    process.env.FRONTEND_URL = 'isto não é url';
    await publicBookingService.createPendingAppointment('studio', INPUT);
    expect(gw.criarPix).toHaveBeenCalledWith('tok', expect.objectContaining({ pagadorEmail: 'reserva-cob-1@localhost' }));
  });

  it('GatewayRecusou no Pix alerta o negócio e cai no código manual, sem deixar cobrança', async () => {
    gw.criarPix.mockRejectedValue(new GatewayRecusou());
    const r = await publicBookingService.createPendingAppointment('studio', INPUT);
    expect(conexaoService.alertarRecusa).toHaveBeenCalledWith('biz-1');
    expect(recRepo.apagarCobranca).toHaveBeenCalledWith('cob-1');
    expect(r).toMatchObject({ pixPayload: MANUAL_PIX, automatica: false });
  });

  it('GatewayIndisponivel no Pix não alerta', async () => {
    gw.criarPix.mockRejectedValue(new GatewayIndisponivel());
    const r = await publicBookingService.createPendingAppointment('studio', INPUT);
    expect(conexaoService.alertarRecusa).not.toHaveBeenCalled();
    expect(recRepo.apagarCobranca).toHaveBeenCalledWith('cob-1');
    expect(r).toMatchObject({ pixPayload: MANUAL_PIX, automatica: false });
  });

  it('erro qualquer do gateway no Pix: reserva criada com o código manual (a cobrança só roda depois da trava)', async () => {
    gw.criarPix.mockRejectedValue(new Error('boom'));
    const r = await publicBookingService.createPendingAppointment('studio', INPUT);
    expect(r).toMatchObject({ appointmentId: 'appt-1', pixPayload: MANUAL_PIX, automatica: false });
    expect(lockTerminou).toBe(true);
  });

  it('falha ao apagar a cobrança não impede a reserva', async () => {
    gw.criarPix.mockRejectedValue(new Error('boom'));
    gw.criarPix.mockRejectedValue(new GatewayRecusou());
    recRepo.apagarCobranca.mockRejectedValue(new Error('banco'));
    const r = await publicBookingService.createPendingAppointment('studio', INPUT);
    expect(r).toMatchObject({ appointmentId: 'appt-1', pixPayload: MANUAL_PIX, automatica: false });
    expect(conexaoService.alertarRecusa).toHaveBeenCalledWith('biz-1');
  });

  it('GatewayTokenInvalido na criação com acesso revogado marca a conexão para reconectar', async () => {
    gw.criarPix.mockRejectedValue(new GatewayTokenInvalido());
    vi.mocked(conexaoService.acessoRevogado).mockResolvedValue(true);
    const r = await publicBookingService.createPendingAppointment('studio', INPUT);
    expect(conexaoService.marcarReconectar).toHaveBeenCalledWith('biz-1', expect.any(String));
    expect(r).toMatchObject({ pixPayload: MANUAL_PIX, automatica: false });
  });

  it('401 na criação com a conta respondendo não derruba a conexão', async () => {
    gw.criarPix.mockRejectedValue(new GatewayTokenInvalido());
    vi.mocked(conexaoService.acessoRevogado).mockResolvedValue(false);
    const r = await publicBookingService.createPendingAppointment('studio', INPUT);
    expect(conexaoService.marcarReconectar).not.toHaveBeenCalled();
    expect(r).toMatchObject({ pixPayload: MANUAL_PIX, automatica: false });
  });

  it('cartão que falha vira Pix manual, avisa a página e manda o código por WhatsApp', async () => {
    gw.criarCheckoutCartao.mockRejectedValue(new Error('boom'));
    const r = await publicBookingService.createPendingAppointment('studio', { ...INPUT, formaPagamento: 'cartao' });
    expect(r).toMatchObject({ forma: 'pix', cartaoIndisponivel: true, automatica: false, checkoutUrl: null, pixPayload: MANUAL_PIX });
    expect(automacoesGatilhos.aoCriarReservaComSinal).toHaveBeenCalledWith('biz-1', 'appt-1', expect.objectContaining({ pixPayload: r.pixPayload }));
  });

  it('cartão pedido sem o negócio liberar: ValidationError antes de criar a reserva', async () => {
    fn(conexaoService.formas).mockResolvedValue(['pix']);
    await expect(publicBookingService.createPendingAppointment('studio', { ...INPUT, formaPagamento: 'cartao' })).rejects.toBeInstanceOf(ValidationError);
    expect(pubRepo.createPendingAppointment).not.toHaveBeenCalled();
  });

  it('o corpo aceita formaPagamento pix ou cartao e o padrão é pix', () => {
    const base = { ...INPUT, serviceId: crypto.randomUUID(), professionalId: crypto.randomUUID() };
    expect(CreatePublicAppointmentSchema.parse(base).formaPagamento).toBeUndefined();
    expect(CreatePublicAppointmentSchema.parse({ ...base, formaPagamento: 'cartao' }).formaPagamento).toBe('cartao');
    expect(() => CreatePublicAppointmentSchema.parse({ ...base, formaPagamento: 'boleto' })).toThrow();
  });
});

describe('getStorefront', () => {
  it('devolve as formas do negócio e ["pix"] quando formas falha', async () => {
    pubRepo.findEligibleServices.mockResolvedValue([]);
    const negocio = { ...BUSINESS, settings: null, mostrarNota: false, galleryPhotos: [], comodidades: [] };
    pubRepo.findBusinessBySlug.mockResolvedValue(negocio);
    expect((await publicBookingService.getStorefront('studio')).formasPagamento).toEqual(['pix', 'cartao']);
    fn(conexaoService.formas).mockRejectedValue(new Error('banco fora'));
    expect((await publicBookingService.getStorefront('studio')).formasPagamento).toEqual(['pix']);
  });
});

const reserva = (extra: Record<string, unknown> = {}) => ({
  id: 'appt-1', status: 'aguardando_pagamento', expiresAt: new Date(Date.now() + 600_000),
  date: new Date('2099-10-24T00:00:00Z'), time: new Date('1970-01-01T14:30:00Z'), depositAmount: 30,
  service: { name: 'Corte', price: 100, durationMinutes: 60 }, professional: { name: 'Ana' },
  ...extra,
});

describe('GET /status', () => {
  it('não devolve nome, telefone nem e-mail da cliente', async () => {
    pubRepo.findPublicAppointment.mockResolvedValue({ ...reserva(), client: { name: 'Maria', phone: '83999990000', email: 'm@x.com' } });
    recRepo.cobrancasDaReserva.mockResolvedValue([]);
    const r = await publicBookingService.getAppointmentStatus('studio', 'appt-1');
    expect(JSON.stringify(r)).not.toContain('Maria');
  });

  it('sem cobrança, aguardando: Pix manual, data e horário no formato da página', async () => {
    pubRepo.findPublicAppointment.mockResolvedValue(reserva());
    recRepo.cobrancasDaReserva.mockResolvedValue([]);
    const r = await publicBookingService.getAppointmentStatus('studio', 'appt-1');
    expect(r.situacao).toBe('aguardando');
    expect(r.reserva).toMatchObject({
      servico: { name: 'Corte', price: 100, durationMinutes: 60 }, profissional: 'Ana', data: '2099-10-24', horario: '14:30',
      sinal: 30, forma: 'pix', pixPayload: MANUAL_PIX, checkoutUrl: null,
    });
    expect(typeof r.reserva.expiresAt).toBe('string');
  });

  it('usa a cobrança pendente ou recusada mais recente', async () => {
    pubRepo.findPublicAppointment.mockResolvedValue(reserva());
    recRepo.cobrancasDaReserva.mockResolvedValue([
      { forma: 'cartao', situacao: 'recusada', idExterno: 'p', codigoPix: null, checkoutUrl: 'https://mp.test/c', pagoEm: null },
      { forma: 'pix', situacao: 'pendente', idExterno: 'o', codigoPix: 'PIX-ANTIGO', checkoutUrl: null, pagoEm: null },
    ]);
    const r = await publicBookingService.getAppointmentStatus('studio', 'appt-1');
    expect(r.reserva).toMatchObject({ forma: 'cartao', pixPayload: null, checkoutUrl: 'https://mp.test/c' });
  });

  it('linha pendente sem idExterno é ignorada', async () => {
    pubRepo.findPublicAppointment.mockResolvedValue(reserva());
    recRepo.cobrancasDaReserva.mockResolvedValue([
      { forma: 'cartao', situacao: 'pendente', idExterno: null, codigoPix: null, checkoutUrl: null, pagoEm: null },
    ]);
    const r = await publicBookingService.getAppointmentStatus('studio', 'appt-1');
    expect(r.reserva).toMatchObject({ forma: 'pix', pixPayload: MANUAL_PIX, checkoutUrl: null });
  });

  it('pixKey ausente: pixPayload nulo, sem erro', async () => {
    pubRepo.findBusinessBySlug.mockResolvedValue({ ...BUSINESS, pixKey: null, pixKeyType: null });
    pubRepo.findPublicAppointment.mockResolvedValue(reserva());
    recRepo.cobrancasDaReserva.mockResolvedValue([]);
    expect((await publicBookingService.getAppointmentStatus('studio', 'appt-1')).reserva.pixPayload).toBeNull();
  });

  it('confirmada: forma da cobrança paga original, ignorando repetidas; sem código nem link', async () => {
    pubRepo.findPublicAppointment.mockResolvedValue(reserva({ status: 'confirmado', expiresAt: null }));
    recRepo.cobrancasDaReserva.mockResolvedValue([
      { forma: 'pix', situacao: 'paga', idExterno: null, codigoPix: null, checkoutUrl: null, pagoEm: new Date() },
      { forma: 'cartao', situacao: 'paga', idExterno: 'pref-1', codigoPix: null, checkoutUrl: 'https://mp.test/c', pagoEm: new Date() },
    ]);
    const r = await publicBookingService.getAppointmentStatus('studio', 'appt-1');
    expect(r.situacao).toBe('confirmado');
    expect(r.reserva).toMatchObject({ forma: 'cartao', pixPayload: null, checkoutUrl: null, expiresAt: null });
  });

  it('vencida: sem código nem link', async () => {
    pubRepo.findPublicAppointment.mockResolvedValue(reserva({ expiresAt: new Date(Date.now() - 1000) }));
    recRepo.cobrancasDaReserva.mockResolvedValue([]);
    const r = await publicBookingService.getAppointmentStatus('studio', 'appt-1');
    expect(r.situacao).toBe('expirado');
    expect(r.reserva).toMatchObject({ pixPayload: null, checkoutUrl: null });
  });
});

describe('POST /pix', () => {
  it('reserva vencida ou confirmada dá 409', async () => {
    recRepo.cobrancasDaReserva.mockResolvedValue([]);
    pubRepo.findPublicAppointment.mockResolvedValue(reserva({ expiresAt: new Date(Date.now() - 1000) }));
    await expect(publicBookingService.getPixDaReserva('studio', 'appt-1')).rejects.toBeInstanceOf(ConflictError);
    pubRepo.findPublicAppointment.mockResolvedValue(reserva({ status: 'confirmado', expiresAt: null }));
    await expect(publicBookingService.getPixDaReserva('studio', 'appt-1')).rejects.toBeInstanceOf(ConflictError);
  });

  it('repetido devolve o mesmo código, sem criar outra cobrança', async () => {
    pubRepo.findPublicAppointment.mockResolvedValue(reserva());
    recRepo.cobrancasDaReserva.mockResolvedValue([
      { forma: 'pix', situacao: 'pendente', idExterno: 'o', codigoPix: 'PIX-JA-CRIADO', checkoutUrl: null, pagoEm: null },
    ]);
    const r = await publicBookingService.getPixDaReserva('studio', 'appt-1');
    expect(r).toMatchObject({ pixPayload: 'PIX-JA-CRIADO', forma: 'pix' });
    expect(recRepo.criarCobranca).not.toHaveBeenCalled();
  });

  it('troca do cartão para Pix cria a cobrança Pix e não mexe na de cartão', async () => {
    pubRepo.findPublicAppointment.mockResolvedValue(reserva());
    recRepo.cobrancasDaReserva.mockResolvedValue([
      { forma: 'cartao', situacao: 'pendente', idExterno: 'p', codigoPix: null, checkoutUrl: 'https://mp.test/c', pagoEm: null },
    ]);
    recRepo.criarCobranca.mockResolvedValue({ id: 'cob-2' });
    const r = await publicBookingService.getPixDaReserva('studio', 'appt-1');
    expect(r.pixPayload).toBe('PIX-DO-GATEWAY');
    expect(recRepo.criarCobranca).toHaveBeenCalledWith(expect.objectContaining({ forma: 'pix', appointmentId: 'appt-1' }));
    expect(recRepo.apagarCobranca).not.toHaveBeenCalled();
  });

  it('com o gateway fora do ar devolve o código manual, sem cobrança', async () => {
    pubRepo.findPublicAppointment.mockResolvedValue(reserva());
    recRepo.cobrancasDaReserva.mockResolvedValue([]);
    recRepo.criarCobranca.mockResolvedValue({ id: 'cob-2' });
    gw.criarPix.mockRejectedValue(new GatewayIndisponivel());
    const r = await publicBookingService.getPixDaReserva('studio', 'appt-1');
    expect(r.pixPayload).toEqual(MANUAL_PIX);
    expect(recRepo.apagarCobranca).toHaveBeenCalledWith('cob-2');
  });

  it('com aceitaPix desligado devolve o código manual, sem gateway', async () => {
    pubRepo.findPublicAppointment.mockResolvedValue(reserva());
    recRepo.cobrancasDaReserva.mockResolvedValue([]);
    fn(conexaoService.formas).mockResolvedValue(['cartao']);
    const r = await publicBookingService.getPixDaReserva('studio', 'appt-1');
    expect(r.pixPayload).toEqual(MANUAL_PIX);
    expect(gw.criarPix).not.toHaveBeenCalled();
    expect(recRepo.criarCobranca).not.toHaveBeenCalled();
  });

  it('sem conexão devolve o código manual sem chamar o gateway', async () => {
    pubRepo.findPublicAppointment.mockResolvedValue(reserva());
    recRepo.cobrancasDaReserva.mockResolvedValue([]);
    fn(conexaoService.tokenAtivo).mockResolvedValue(null);
    const r = await publicBookingService.getPixDaReserva('studio', 'appt-1');
    expect(r.pixPayload).toEqual(MANUAL_PIX);
    expect(recRepo.criarCobranca).not.toHaveBeenCalled();
  });
});
