import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { publicBookingService } from '../modules/publicBooking/publicBooking.service.js';
import { publicBookingRepository } from '../modules/publicBooking/publicBooking.repository.js';
import { appointmentsPrismaRepository } from '../modules/appointments/appointments.repository.js';
import { recebimentosRepository } from '../modules/recebimentos/recebimentos.repository.js';
import { conexaoService } from '../modules/recebimentos/conexao.service.js';
import { automacoesGatilhos } from '../modules/whatsappAutomacoes/gatilhos.service.js';
import { infinitePay } from '../modules/recebimentos/gateways/infinitePay.js';
import { gateways, GatewayIndisponivel, GatewayRecusou, GatewayTokenInvalido } from '../modules/recebimentos/gateways/index.js';
import { CreatePublicAppointmentSchema } from '../modules/publicBooking/publicBooking.types.js';
import { generateAvailableTimeSlots, getBusinessScheduleSettings } from '../services/scheduleSettingsService.js';
import { pagamentosService } from '../modules/recebimentos/pagamentos.service.js';
import { cobrancasService } from '../modules/recebimentos/cobrancas.service.js';
import { ConfirmarInfinitePaySchema } from '../modules/publicBooking/publicBooking.types.js';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors.js';

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
    criarCobranca: vi.fn(), completarCobranca: vi.fn(), apagarCobranca: vi.fn(), cobrancasDaReserva: vi.fn(), cobrancaDaReserva: vi.fn(),
  },
}));
vi.mock('../modules/recebimentos/conexao.service.js', () => ({
  conexaoService: { formas: vi.fn(), credencial: vi.fn(), gatewayAtivo: vi.fn(), tokenAtivo: vi.fn(), alertarRecusa: vi.fn(), marcarReconectar: vi.fn(), acessoRevogado: vi.fn(), cartaoForaDoAr: vi.fn() },
}));
vi.mock('../modules/recebimentos/gateways/index.js', async (original) => ({
  ...(await original<typeof import('../modules/recebimentos/gateways/index.js')>()),
  gateways: { mercadopago: { criarPix: vi.fn(), criarCheckoutCartao: vi.fn() } },
}));

vi.mock('../modules/recebimentos/pagamentos.service.js', () => ({ pagamentosService: { confirmarInfinitePay: vi.fn() } }));
vi.mock('../modules/recebimentos/gateways/infinitePay.js', () => ({ infinitePay: { criarLink: vi.fn() } }));

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
  fn(conexaoService.credencial).mockResolvedValue(null);
  fn(conexaoService.gatewayAtivo).mockResolvedValue('mercadopago');
  recRepo.criarCobranca.mockImplementation(async () => {
    expect(lockTerminou).toBe(true);
    return { id: 'cob-1' };
  });
  recRepo.apagarCobranca.mockResolvedValue(undefined);
  gw.criarPix.mockResolvedValue({ idExterno: 'ord-1', codigoPix: 'PIX-DO-GATEWAY' });
  gw.criarCheckoutCartao.mockResolvedValue({ idExterno: 'pref-1', checkoutUrl: 'https://mp.test/checkout' });
});

afterEach(() => { delete process.env.FRONTEND_URL; delete process.env.BACKEND_URL; });

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

  it('cartão pedido com a conexão fora do ar: cria a reserva no Pix manual e avisa a página', async () => {
    fn(conexaoService.formas).mockResolvedValue(['pix']);
    fn(conexaoService.cartaoForaDoAr).mockResolvedValue(true);
    const r = await publicBookingService.createPendingAppointment('studio', { ...INPUT, formaPagamento: 'cartao' });
    expect(r).toMatchObject({ forma: 'pix', cartaoIndisponivel: true, automatica: false, pixPayload: MANUAL_PIX, checkoutUrl: null });
    expect(recRepo.criarCobranca).not.toHaveBeenCalled();
  });

  it('negócio só com cartão: sem forma pedida, cobra no cartão', async () => {
    fn(conexaoService.formas).mockResolvedValue(['cartao']);
    const r = await publicBookingService.createPendingAppointment('studio', INPUT);
    expect(gw.criarCheckoutCartao).toHaveBeenCalled();
    expect(r).toMatchObject({ forma: 'cartao' });
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

  it('cartão vencido e cancelado pela rotina: aparece como expirado, na forma cartão', async () => {
    pubRepo.findPublicAppointment.mockResolvedValue(reserva({ status: 'cancelado', expiresAt: new Date(Date.now() - 1000) }));
    recRepo.cobrancasDaReserva.mockResolvedValue([
      { forma: 'cartao', situacao: 'expirada', idExterno: 'pref-1', codigoPix: null, checkoutUrl: 'https://mp.test/c', pagoEm: null },
    ]);
    const r = await publicBookingService.getAppointmentStatus('studio', 'appt-1');
    expect(r.situacao).toBe('expirado');
    expect(r.reserva).toMatchObject({ forma: 'cartao', pixPayload: null, checkoutUrl: null });
  });

  it('cancelada pelo negócio continua cancelada', async () => {
    pubRepo.findPublicAppointment.mockResolvedValue(reserva({ status: 'cancelado' }));
    recRepo.cobrancasDaReserva.mockResolvedValue([
      { forma: 'pix', situacao: 'pendente', idExterno: 'o', codigoPix: 'X', checkoutUrl: null, pagoEm: null },
    ]);
    expect((await publicBookingService.getAppointmentStatus('studio', 'appt-1')).situacao).toBe('cancelado');
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

describe('InfinitePay: link na reserva', () => {
  const CRED = { gateway: 'infinitepay', cred: { handle: 'loja' } };
  beforeEach(() => {
    process.env.BACKEND_URL = 'https://api.x.com/';
    fn(conexaoService.formas).mockResolvedValue(['cartao']);
    fn(conexaoService.credencial).mockResolvedValue(CRED);
    fn(conexaoService.tokenAtivo).mockResolvedValue(null);
    fn(infinitePay.criarLink).mockResolvedValue({ checkoutUrl: 'https://ip.test/pay' });
  });

  it('cria o link com a volta da reserva e o webhook da cobrança', async () => {
    const r = await publicBookingService.createPendingAppointment('studio', { ...INPUT, formaPagamento: 'cartao' });
    expect(infinitePay.criarLink).toHaveBeenCalledWith(CRED.cred, expect.objectContaining({ cobrancaId: 'cob-1', valor: 30 }), {
      volta: 'https://www.easybarber.com.br/agendar/studio?reserva=appt-1&retorno=infinitepay',
      webhook: 'https://api.x.com/api/v1/recebimentos/webhook/infinitepay/cob-1',
    });
    expect(recRepo.criarCobranca).toHaveBeenCalledWith(expect.objectContaining({ gateway: 'infinitepay', forma: 'cartao' }));
    expect(recRepo.completarCobranca).toHaveBeenCalledWith('cob-1', { idExterno: 'cob-1', checkoutUrl: 'https://ip.test/pay' });
    expect(r).toMatchObject({ forma: 'cartao', pixPayload: null, checkoutUrl: 'https://ip.test/pay', automatica: true });
    expect(gw.criarCheckoutCartao).not.toHaveBeenCalled();
    expect(automacoesGatilhos.aoCriarReservaComSinal).not.toHaveBeenCalled();
  });

  it('pedido de Pix com credencial: a linha nasce como cartão (caminho do link)', async () => {
    await publicBookingService.createPendingAppointment('studio', INPUT);
    expect(recRepo.criarCobranca).toHaveBeenCalledWith(expect.objectContaining({ gateway: 'infinitepay', forma: 'cartao' }));
  });

  it('cobrança pedida em Pix com a InfinitePay: nenhuma cobrança, quem chama cai no Pix manual', async () => {
    const r = await cobrancasService.criar({
      businessId: 'biz-1', slug: 'studio', appointmentId: 'appt-1', forma: 'pix', valor: 30, descricao: 'Sinal - Corte', venceEm: new Date(),
    });
    expect(r).toBeNull();
    expect(recRepo.criarCobranca).not.toHaveBeenCalled();
    expect(infinitePay.criarLink).not.toHaveBeenCalled();
    expect(gw.criarPix).not.toHaveBeenCalled();
  });

  it('GatewayTokenInvalido com acesso revogado marca reconectar e apaga a cobrança', async () => {
    fn(infinitePay.criarLink).mockRejectedValue(new GatewayTokenInvalido());
    vi.mocked(conexaoService.acessoRevogado).mockResolvedValue(true);
    await publicBookingService.createPendingAppointment('studio', { ...INPUT, formaPagamento: 'cartao' });
    expect(conexaoService.acessoRevogado).toHaveBeenCalledWith('biz-1', 'infinitepay', undefined);
    expect(conexaoService.marcarReconectar).toHaveBeenCalledWith('biz-1', expect.any(String));
    expect(recRepo.apagarCobranca).toHaveBeenCalledWith('cob-1');
  });

  it('GatewayRecusou alerta o negócio', async () => {
    fn(infinitePay.criarLink).mockRejectedValue(new GatewayRecusou());
    await publicBookingService.createPendingAppointment('studio', { ...INPUT, formaPagamento: 'cartao' });
    expect(conexaoService.alertarRecusa).toHaveBeenCalledWith('biz-1');
  });
});

describe('gateway da reserva', () => {
  it('storefront traz gatewayPagamento de gatewayAtivo', async () => {
    pubRepo.findEligibleServices.mockResolvedValue([]);
    pubRepo.findBusinessBySlug.mockResolvedValue({ ...BUSINESS, settings: null, mostrarNota: false, galleryPhotos: [], comodidades: [] });
    fn(conexaoService.gatewayAtivo).mockResolvedValue('infinitepay');
    expect((await publicBookingService.getStorefront('studio')).gatewayPagamento).toBe('infinitepay');
    fn(conexaoService.gatewayAtivo).mockRejectedValue(new Error('x'));
    expect((await publicBookingService.getStorefront('studio')).gatewayPagamento).toBeNull();
  });

  it('status traz o gateway da cobrança atual e da paga', async () => {
    pubRepo.findPublicAppointment.mockResolvedValue(reserva());
    recRepo.cobrancasDaReserva.mockResolvedValue([
      { gateway: 'infinitepay', forma: 'cartao', situacao: 'pendente', idExterno: 'c', codigoPix: null, checkoutUrl: 'https://ip.test/pay', pagoEm: null },
    ]);
    expect((await publicBookingService.getAppointmentStatus('studio', 'appt-1')).reserva.gateway).toBe('infinitepay');
    pubRepo.findPublicAppointment.mockResolvedValue(reserva({ status: 'confirmado', expiresAt: null }));
    recRepo.cobrancasDaReserva.mockResolvedValue([
      { gateway: 'mercadopago', forma: 'cartao', situacao: 'paga', idExterno: 'c', codigoPix: null, checkoutUrl: null, pagoEm: new Date() },
    ]);
    expect((await publicBookingService.getAppointmentStatus('studio', 'appt-1')).reserva.gateway).toBe('mercadopago');
    recRepo.cobrancasDaReserva.mockResolvedValue([]);
    expect((await publicBookingService.getAppointmentStatus('studio', 'appt-1')).reserva.gateway).toBeNull();
  });
});

describe('volta da InfinitePay', () => {
  const COB = '11111111-1111-4111-8111-111111111111';
  const volta = { orderNsu: COB, transactionNsu: 'tx-1', fatura: 'fat-1' };

  it('cobrança de outra reserva: 404 e não confirma', async () => {
    pubRepo.findPublicAppointment.mockResolvedValue(reserva());
    recRepo.cobrancaDaReserva.mockResolvedValue(null);
    await expect(publicBookingService.confirmarInfinitePay('studio', 'appt-1', volta)).rejects.toBeInstanceOf(NotFoundError);
    expect(recRepo.cobrancaDaReserva).toHaveBeenCalledWith(COB, 'appt-1', 'infinitepay');
    expect(pagamentosService.confirmarInfinitePay).not.toHaveBeenCalled();
  });

  it('orderNsu que não é id de cobrança: 404 sem consultar o banco', async () => {
    pubRepo.findPublicAppointment.mockResolvedValue(reserva());
    await expect(publicBookingService.confirmarInfinitePay('studio', 'appt-1', { ...volta, orderNsu: 'outro' })).rejects.toBeInstanceOf(NotFoundError);
    expect(recRepo.cobrancaDaReserva).not.toHaveBeenCalled();
    expect(pagamentosService.confirmarInfinitePay).not.toHaveBeenCalled();
  });

  it('reserva de outro negócio: 404', async () => {
    pubRepo.findPublicAppointment.mockResolvedValue(null);
    await expect(publicBookingService.confirmarInfinitePay('studio', 'appt-1', volta)).rejects.toBeInstanceOf(NotFoundError);
    expect(pagamentosService.confirmarInfinitePay).not.toHaveBeenCalled();
  });

  it('confere o pagamento e devolve o status, mesmo com tentar_de_novo', async () => {
    pubRepo.findPublicAppointment.mockResolvedValue(reserva());
    recRepo.cobrancaDaReserva.mockResolvedValue({ id: COB });
    recRepo.cobrancasDaReserva.mockResolvedValue([]);
    fn(pagamentosService.confirmarInfinitePay).mockResolvedValue('tentar_de_novo');
    const r = await publicBookingService.confirmarInfinitePay('studio', 'appt-1', volta);
    expect(pagamentosService.confirmarInfinitePay).toHaveBeenCalledWith({ cobrancaId: COB, orderNsu: COB, transactionNsu: 'tx-1', fatura: 'fat-1' });
    expect(r).toEqual(await publicBookingService.getAppointmentStatus('studio', 'appt-1'));
  });

  it('o corpo precisa ter o formato dos códigos', () => {
    expect(ConfirmarInfinitePaySchema.safeParse(volta).success).toBe(true);
    expect(ConfirmarInfinitePaySchema.safeParse({ ...volta, fatura: 'a b' }).success).toBe(false);
    expect(ConfirmarInfinitePaySchema.safeParse({ ...volta, transactionNsu: 'x'.repeat(101) }).success).toBe(false);
  });
});
