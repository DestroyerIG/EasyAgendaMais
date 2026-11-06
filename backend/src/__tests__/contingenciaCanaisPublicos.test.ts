import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockEstado = vi.hoisted(() => vi.fn());
const mockSend = vi.hoisted(() => vi.fn());
const mockGetSession = vi.hoisted(() => vi.fn());
const mockIsExpired = vi.hoisted(() => vi.fn());
const mockCreateSession = vi.hoisted(() => vi.fn());
const mockDeleteSession = vi.hoisted(() => vi.fn());
const mockBuildMenu = vi.hoisted(() => vi.fn());
const mockBusinessFindFirst = vi.hoisted(() => vi.fn());
const mockSettings = vi.hoisted(() => vi.fn());
const mockFindBySlug = vi.hoisted(() => vi.fn());
const mockDentroDoHorario = vi.hoisted(() => vi.fn(() => true));

vi.mock('../modules/conta/estadoConta.service.js', () => ({
  estadoContaService: { doNegocio: mockEstado, limparCache: vi.fn() },
}));
vi.mock('../utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
}));
vi.mock('../config/database.js', () => ({ default: { query: vi.fn() } }));
vi.mock('../config/prisma.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([]),
    business: { findFirst: mockBusinessFindFirst },
  },
}));
vi.mock('../modules/whatsappInbox/inbox.recorder.js', () => ({ inboxRecorder: { pedirAtendimentoHumano: vi.fn() } }));
vi.mock('../services/whatsapp/whatsappMessageService.js', () => ({
  sendWhatsAppMessage: mockSend,
  buildWelcomeMessage: mockBuildMenu,
  formatMessage: vi.fn((m: unknown) => m),
}));
vi.mock('../services/whatsappClient.js', () => ({
  getWhatsAppStatus: vi.fn(),
  getWhatsAppStatusByInstance: vi.fn(),
  getConnectedNumberCached: vi.fn(() => '5511888888888'),
}));
vi.mock('../services/whatsapp/whatsappSessionService.js', () => ({
  getSession: mockGetSession,
  isSessionExpired: mockIsExpired,
  createSession: mockCreateSession,
  updateSession: vi.fn(),
  deleteSession: mockDeleteSession,
}));
vi.mock('../services/whatsapp/whatsappConfigService.js', () => ({
  getBotConfig: vi.fn().mockResolvedValue({}),
  getMenuOptions: vi.fn().mockResolvedValue([{ label: 'Agendar', emoji: 'x' }]),
}));
vi.mock('../services/scheduleSettingsService.js', () => ({
  getBusinessScheduleSettings: mockSettings,
  closesTodayAt: () => null,
  isWithinBusinessHours: mockDentroDoHorario,
  isBusinessOpenOnDate: vi.fn(() => true),
  generateAvailableTimeSlots: vi.fn(() => []),
  formatBusinessHoursRange: vi.fn(() => '08:00 as 18:00'),
}));
vi.mock('../services/appointmentService.js', () => ({ appointmentService: { create: vi.fn() } }));

vi.mock('../modules/publicBooking/publicBooking.repository.js', () => ({
  publicBookingRepository: {
    findBusinessBySlug: mockFindBySlug,
    findEligibleServices: vi.fn().mockResolvedValue([]),
    findServiceForBusiness: vi.fn(),
    findProfessionalForBusiness: vi.fn(),
    findOrCreateClient: vi.fn(),
    registrarConsentimento: vi.fn(),
  },
}));
vi.mock('../modules/appointments/appointments.repository.js', () => ({ appointmentsPrismaRepository: {} }));
vi.mock('../modules/notifications/notifications.service.js', () => ({ notificationsService: { notify: vi.fn() } }));
vi.mock('../modules/whatsappAutomacoes/gatilhos.service.js', () => ({ automacoesGatilhos: {} }));
vi.mock('../modules/googleAgenda/googleAgenda.service.js', () => ({ googleAgendaService: {} }));
vi.mock('../modules/clube/clube.repository.js', () => ({
  clubeRepository: { buscarOferta: vi.fn(), listarOfertas: vi.fn() },
}));
vi.mock('../modules/clube/clube.service.js', () => ({
  criarContrato: vi.fn(), enviarCobranca: vi.fn(), gerarPix: vi.fn(), paraOfertaDto: vi.fn(),
}));

import { publicBookingService } from '../modules/publicBooking/publicBooking.service.js';
import { clubePublicService } from '../modules/clube/clube.public.service.js';
import { ConflictError } from '../utils/errors.js';
import { textoAgendaPausada } from '../modules/conta/estadoConta.rules.js';
const { handleIncomingMessage } = await import('../services/whatsapp/whatsappFlowService.js');

const PAUSADA = 'A agenda online está pausada no momento. Fale direto com Studio Aurora pelo WhatsApp.';
const CARENCIA = { tipo: 'carencia', desde: new Date(), ate: new Date(), diasRestantes: 3 };
const BLOQUEADA = { tipo: 'bloqueada', motivo: 'cobranca' };
const BUSINESS = {
  id: 'biz-1', name: 'Studio Aurora', slug: 'aurora', whatsapp: '5511999990000', logoUrl: null, brandColor: null,
  galleryPhotos: [], address: null, pixKey: 'k', pixKeyType: 'email', settings: { segment: 'barbearia' },
  plan: 'salao', subscriptionStatus: 'past_due',
};

describe('textoAgendaPausada', () => {
  it('usa a frase exata', () => expect(textoAgendaPausada('Studio Aurora')).toBe(PAUSADA));
});

describe('link publico', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindBySlug.mockResolvedValue(BUSINESS);
  });

  it('getStorefront: carencia pausa e devolve o whatsapp', async () => {
    mockEstado.mockResolvedValue(CARENCIA);
    const s = await publicBookingService.getStorefront('aurora');
    expect(s.agendaPausada).toBe(true);
    expect(s.whatsapp).toBe('5511999990000');
  });

  it('getStorefront: ativa nao pausa', async () => {
    mockEstado.mockResolvedValue({ tipo: 'ativa' });
    expect((await publicBookingService.getStorefront('aurora')).agendaPausada).toBe(false);
  });

  it('createPendingAppointment: fora de ativa responde 409 com a frase', async () => {
    mockEstado.mockResolvedValue(BLOQUEADA);
    const p = publicBookingService.createPendingAppointment('aurora', {
      serviceId: 's', professionalId: 'p', date: '2026-11-01', time: '10:00', clientName: 'Ana', clientPhone: '11999990000',
    } as never);
    await expect(p).rejects.toBeInstanceOf(ConflictError);
    await expect(p).rejects.toMatchObject({ statusCode: 409, message: PAUSADA });
  });

  it('adesao ao clube: fora de ativa responde 409 com a frase', async () => {
    mockEstado.mockResolvedValue(CARENCIA);
    mockBusinessFindFirst.mockResolvedValue(BUSINESS);
    const p = clubePublicService.aderir('aurora', 'oferta-1', { nome: 'Ana', telefone: '11999990000' } as never);
    await expect(p).rejects.toBeInstanceOf(ConflictError);
    await expect(p).rejects.toMatchObject({ statusCode: 409, message: PAUSADA });
  });
});

describe('robo', () => {
  const payload = { event: 'messages-upsert', key: { remoteJid: '5511777777777@s.whatsapp.net', fromMe: false }, message: { conversation: 'oi' } };
  const opts = { eventName: 'messages-upsert', businessId: 'biz-1', now: new Date('2026-10-28T13:00:00Z') };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue(true);
    mockBuildMenu.mockReturnValue('menu');
    mockGetSession.mockResolvedValue({ step: 'x' });
    mockIsExpired.mockReturnValue(false);
    mockCreateSession.mockResolvedValue(undefined);
    mockDeleteSession.mockResolvedValue(undefined);
    mockBusinessFindFirst.mockResolvedValue({ name: 'Studio Aurora' });
    mockDentroDoHorario.mockReturnValue(true);
    mockSettings.mockResolvedValue({
      openingTime: '08:00', closingTime: '18:00', slotIntervalMinutes: 30, timezone: 'America/Sao_Paulo',
    });
  });

  it('bloqueada com sessao ativa: avisa, apaga a sessao e nao monta o menu', async () => {
    mockEstado.mockResolvedValue(BLOQUEADA);
    await handleIncomingMessage(payload, 'oi', opts);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][1]).toBe(PAUSADA);
    expect(mockDeleteSession).toHaveBeenCalled();
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('simulationMode segue o fluxo normal', async () => {
    mockEstado.mockResolvedValue(BLOQUEADA);
    await handleIncomingMessage(payload, 'oi', { ...opts, simulationMode: true });
    expect(mockSend.mock.calls.some((c) => c[1] === PAUSADA)).toBe(false);
    expect(mockCreateSession).toHaveBeenCalled();
  });

  it('nao e saudacao e sem sessao: nada e enviado', async () => {
    mockEstado.mockResolvedValue(BLOQUEADA);
    mockGetSession.mockResolvedValue(null);
    await handleIncomingMessage(
      { ...payload, message: { conversation: 'quanto custa o corte de barba' } },
      'quanto custa o corte de barba',
      opts
    );
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('bloqueada fora do horário: só a frase da agenda pausada, sem a mensagem de fora do horário', async () => {
    mockEstado.mockResolvedValue(BLOQUEADA);
    mockDentroDoHorario.mockReturnValue(false);
    mockGetSession.mockResolvedValue(null);
    await handleIncomingMessage(payload, 'oi', { ...opts, now: new Date('2026-10-29T01:00:00Z') });
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][1]).toBe(PAUSADA);
  });

  it('bloqueada fora do horário e sem saudação: nada é enviado', async () => {
    mockEstado.mockResolvedValue(BLOQUEADA);
    mockDentroDoHorario.mockReturnValue(false);
    mockGetSession.mockResolvedValue(null);
    await handleIncomingMessage(
      { ...payload, message: { conversation: 'quanto custa o corte de barba' } },
      'quanto custa o corte de barba',
      { ...opts, now: new Date('2026-10-29T01:00:00Z') }
    );
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('saudacao sem sessao tambem recebe o aviso', async () => {
    mockEstado.mockResolvedValue(CARENCIA);
    mockGetSession.mockResolvedValue(null);
    await handleIncomingMessage(payload, 'oi', opts);
    expect(mockSend.mock.calls[0][1]).toBe(PAUSADA);
  });
});
