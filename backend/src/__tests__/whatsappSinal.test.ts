import { vi, describe, it, beforeEach, expect } from 'vitest';

const mockPoolQuery = vi.hoisted(() => vi.fn());
const mockSendWhatsAppMessage = vi.hoisted(() => vi.fn());
const mockGetSession = vi.hoisted(() => vi.fn());
const mockCreateSession = vi.hoisted(() => vi.fn());
const mockUpdateSession = vi.hoisted(() => vi.fn());
const mockDeleteSession = vi.hoisted(() => vi.fn());
const mockGetBotConfig = vi.hoisted(() => vi.fn());
const mockAppointmentCreate = vi.hoisted(() => vi.fn());
const mockAppointmentUpdate = vi.hoisted(() => vi.fn());
const mockAppointmentUpdateStatus = vi.hoisted(() => vi.fn());
const mockCriarReserva = vi.hoisted(() => vi.fn());
const mockLoggerWarn = vi.hoisted(() => vi.fn());
const mockCancelarPendente = vi.hoisted(() => vi.fn());

vi.mock('../modules/conta/estadoConta.service.js', () => ({ estadoContaService: { doNegocio: vi.fn().mockResolvedValue({ tipo: 'ativa' }) } }));
vi.mock('../config/prisma.js', () => {
  const queryRaw = vi.fn(async (input: unknown) => {
    const r = await mockPoolQuery(input);
    return Array.isArray(r) ? r : [];
  });
  return {
    prisma: {
      $queryRaw: queryRaw,
      $executeRaw: queryRaw,
      business: { findFirst: vi.fn() },
      service: { findFirst: vi.fn() },
      client: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn(), update: vi.fn() },
      appointment: { findFirst: vi.fn().mockResolvedValue(null), updateMany: vi.fn() },
      menuOption: { findMany: vi.fn().mockResolvedValue([]) },
    },
  };
});
vi.mock('../modules/whatsappAutomacoes/gatilhos.service.js', () => ({
  automacoesGatilhos: { aoCancelar: vi.fn(), toleranciaSinal: vi.fn().mockResolvedValue(30) },
}));
vi.mock('../modules/whatsappInbox/inbox.recorder.js', () => ({ inboxRecorder: { pedirAtendimentoHumano: vi.fn() } }));
vi.mock('../utils/logger.js', () => ({
  default: { info: vi.fn(), warn: mockLoggerWarn, error: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
}));
vi.mock('../services/whatsapp/whatsappMessageService.js', async (orig) => ({
  ...(await orig<typeof import('../services/whatsapp/whatsappMessageService.js')>()),
  sendWhatsAppMessage: mockSendWhatsAppMessage,
}));
vi.mock('../services/whatsappClient.js', () => ({
  getWhatsAppStatus: vi.fn(() => ({ connectedNumber: null })),
  getWhatsAppStatusByInstance: vi.fn(() => ({ connectedNumber: null })),
  getConnectedNumberCached: vi.fn(() => null),
}));
// isSessionExpired é o real: a espera do sinal não pode cair no tempo limite da sessão.
vi.mock('../services/whatsapp/whatsappSessionService.js', async (orig) => ({
  ...(await orig<typeof import('../services/whatsapp/whatsappSessionService.js')>()),
  getSession: mockGetSession,
  createSession: mockCreateSession,
  updateSession: mockUpdateSession,
  deleteSession: mockDeleteSession,
}));
vi.mock('../services/whatsapp/whatsappConfigService.js', () => ({
  getBotConfig: mockGetBotConfig,
  getMenuOptions: vi.fn().mockResolvedValue([]),
}));
vi.mock('../services/scheduleSettingsService.js', () => ({
  getBusinessScheduleSettings: vi.fn().mockResolvedValue({ openingTime: '08:00', closingTime: '18:00', allowWalkins: false }),
  isWithinBusinessHours: vi.fn(() => true),
  isBusinessOpenOnDate: vi.fn(() => true),
  generateAvailableTimeSlots: vi.fn(() => []),
  formatBusinessHoursRange: vi.fn(() => '08:00 as 18:00'),
}));
vi.mock('../services/appointmentService.js', () => ({
  appointmentService: { create: mockAppointmentCreate, update: mockAppointmentUpdate, updateStatus: mockAppointmentUpdateStatus },
}));
vi.mock('../modules/recebimentos/reservaComSinal.service.js', () => ({
  reservaComSinalService: { criar: mockCriarReserva },
}));
vi.mock('../modules/recebimentos/recebimentos.repository.js', () => ({
  recebimentosRepository: { cancelarReservaPendente: mockCancelarPendente },
}));

const { handleIncomingMessage } = await import('../services/whatsapp/whatsappFlowService.js');
const { deveCobrarNoRobo } = await import('../services/whatsapp/whatsappSinalService.js');
const { prisma } = await import('../config/prisma.js');
const { ConflictError } = await import('../utils/errors.js');
const { DEFAULT_BOT_CONFIG, AVISO_TESTE, STEPS } = await import('../services/whatsapp/whatsappConstants.js');

const NUMERO = '5511777777777';
const NEGOCIO = 'tenant-1';
const AGORA = new Date('2026-04-18T10:00:00-03:00');
const PIX = '00020126580014BR.GOV.BCB.PIX-codigo-real';

const enviar = (texto: string, extra: Record<string, unknown> = {}) =>
  handleIncomingMessage(NUMERO, texto, { businessId: NEGOCIO, businessContextSource: 'payload', now: AGORA, ...extra });
const enviadas = () => mockSendWhatsAppMessage.mock.calls.map((c) => String(c[1]));

const negocio = (o: Record<string, unknown> = {}) => ({
  id: NEGOCIO, name: 'Studio Aurora', slug: 'aurora', pixKey: 'studio@aurora.com', pixKeyType: 'email', botCobraSinal: true, ...o,
});
const servico = (o: Record<string, unknown> = {}) => ({ id: 'service-1', name: 'Corte', price: 80, depositPercentage: 25, ...o });

const sessaoEscolhendoHorario = (data: Record<string, unknown> = {}) => mockGetSession.mockResolvedValue({
  step: 'choose_time',
  data: {
    availableSlots: ['10:00', '10:30'], selectedDate: '2026-04-20', professionalId: 'professional-1',
    clientId: 'client-1', clientName: 'Joana', serviceId: 'service-1', serviceName: 'Corte',
    professionalName: 'Joao', servicePrice: 80, ...data,
  },
});

const reserva = (o: Record<string, unknown> = {}) => ({
  appointment: { id: 'apt-9' }, depositAmount: 20, pixPayload: PIX, checkoutUrl: null, forma: 'pix',
  automatica: false, cartaoIndisponivel: false, toleranciaMin: 30, expiresAt: new Date('2026-04-18T13:30:00Z'), ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPoolQuery.mockResolvedValue([]);
  mockSendWhatsAppMessage.mockReset().mockResolvedValue(true);
  mockAppointmentCreate.mockResolvedValue({ id: 'apt-1', status: 'confirmado' });
  mockCancelarPendente.mockReset().mockResolvedValue(true);
  mockCriarReserva.mockResolvedValue(reserva());
  mockGetBotConfig.mockResolvedValue({ ...DEFAULT_BOT_CONFIG, confirmation_message: 'Agendamento confirmado' });
  vi.mocked(prisma.business.findFirst).mockResolvedValue(negocio() as never);
  vi.mocked(prisma.service.findFirst).mockResolvedValue(servico() as never);
  vi.mocked(prisma.appointment.findFirst).mockReset().mockResolvedValue(null as never);
});

describe('deveCobrarNoRobo', () => {
  const tudoLigado = { botCobraSinal: true, pixKey: 'a@b.com', pixKeyType: 'email', price: 80, depositPercentage: 25 };

  it('falso com a opção desligada', () => {
    expect(deveCobrarNoRobo({ ...tudoLigado, botCobraSinal: false })).toBe(false);
  });

  it('falso sem depositPercentage (nulo e 0)', () => {
    expect(deveCobrarNoRobo({ ...tudoLigado, depositPercentage: null })).toBe(false);
    expect(deveCobrarNoRobo({ ...tudoLigado, depositPercentage: 0 })).toBe(false);
  });

  it('falso sem chave Pix', () => {
    expect(deveCobrarNoRobo({ ...tudoLigado, pixKey: null })).toBe(false);
    expect(deveCobrarNoRobo({ ...tudoLigado, pixKeyType: null })).toBe(false);
  });

  it('verdadeiro com tudo ligado', () => {
    expect(deveCobrarNoRobo(tudoLigado)).toBe(true);
  });
});

describe('robô cobra o sinal ao agendar', () => {
  it('com a opção ligada cria a reserva com source whatsapp e manda a mensagem do sinal e o código Pix em mensagem separada', async () => {
    sessaoEscolhendoHorario();

    const r = await enviar('1');

    expect(r).toEqual(expect.objectContaining({ ok: true }));
    expect(mockCriarReserva).toHaveBeenCalledWith(expect.objectContaining({
      business: { id: NEGOCIO, name: 'Studio Aurora', slug: 'aurora', pixKey: 'studio@aurora.com', pixKeyType: 'email' },
      clientId: 'client-1', professionalId: 'professional-1', serviceId: 'service-1',
      serviceName: 'Corte', servicePrice: 80, depositPercentage: 25,
      date: '2026-04-20', time: '10:00', origem: 'whatsapp',
    }));
    expect(mockCriarReserva.mock.calls[0][0]).not.toHaveProperty('formaPedida');
    expect(mockAppointmentCreate).not.toHaveBeenCalled();
    const msgs = enviadas();
    expect(msgs).toHaveLength(2);
    expect(msgs[0]).toContain('Corte');
    expect(msgs[0]).toContain('R$ 20,00');
    expect(msgs[0]).toContain('30 min');
    expect(msgs[0]).not.toContain(PIX);
    expect(msgs[1]).toBe(PIX);
    expect(msgs.some((m) => m.includes('Agendamento confirmado'))).toBe(false);
  });

  it('com cartão como padrão manda o link de pagamento, sem copia e cola', async () => {
    sessaoEscolhendoHorario();
    mockCriarReserva.mockResolvedValue(reserva({ forma: 'cartao', pixPayload: null, checkoutUrl: 'https://pay.exemplo/abc', automatica: true }));

    await enviar('1');

    const msgs = enviadas();
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain('https://pay.exemplo/abc');
    expect(msgs[0]).toContain('R$ 20,00');
    expect(msgs[0]).not.toContain('{');
  });

  it('coloca a sessão em awaiting_deposit com appointmentId e expiresAt', async () => {
    sessaoEscolhendoHorario();

    await enviar('1');

    expect(mockUpdateSession).toHaveBeenCalledWith(NUMERO, NEGOCIO, STEPS.AWAITING_DEPOSIT, {
      appointmentId: 'apt-9', expiresAt: '2026-04-18T13:30:00.000Z',
    });
    expect(mockDeleteSession).not.toHaveBeenCalled();
  });

  it('se a mensagem do sinal não sai, cancela a reserva na hora', async () => {
    sessaoEscolhendoHorario();
    mockSendWhatsAppMessage.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const r = await enviar('1');

    expect(r).toEqual(expect.objectContaining({ ok: false }));
    expect(mockCancelarPendente).toHaveBeenCalledWith('apt-9', NEGOCIO);
    expect(mockAppointmentUpdateStatus).not.toHaveBeenCalled();
    expect(mockUpdateSession).not.toHaveBeenCalledWith(NUMERO, NEGOCIO, STEPS.AWAITING_DEPOSIT, expect.anything());
  });

  it('cancelamento por falha no envio não mexe numa reserva já confirmada', async () => {
    sessaoEscolhendoHorario();
    mockSendWhatsAppMessage.mockResolvedValueOnce(false);
    mockCancelarPendente.mockResolvedValue(false); // já saiu de aguardando_pagamento

    const r = await enviar('1');

    expect(r).toEqual(expect.objectContaining({ ok: false }));
    expect(mockCancelarPendente).toHaveBeenCalledWith('apt-9', NEGOCIO);
    expect(mockAppointmentUpdateStatus).not.toHaveBeenCalled();
  });

  it('serviço sem sinal confirma direto, como hoje', async () => {
    for (const depositPercentage of [null, 0]) {
      vi.clearAllMocks();
      mockSendWhatsAppMessage.mockReset().mockResolvedValue(true);
      mockAppointmentCreate.mockResolvedValue({ id: 'apt-1', status: 'confirmado' });
      sessaoEscolhendoHorario();
      vi.mocked(prisma.service.findFirst).mockResolvedValue(servico({ depositPercentage }) as never);

      await enviar('1');

      expect(mockCriarReserva).not.toHaveBeenCalled();
      expect(mockAppointmentCreate).toHaveBeenCalledWith(NEGOCIO, expect.objectContaining({ serviceId: 'service-1', time: '10:00' }), { source: 'whatsapp' });
      expect(enviadas()).toEqual(['Agendamento confirmado']);
      expect(mockDeleteSession).toHaveBeenCalledWith(NUMERO, NEGOCIO);
    }
  });

  it('com a opção desligada agenda como hoje', async () => {
    sessaoEscolhendoHorario();
    vi.mocked(prisma.business.findFirst).mockResolvedValue(negocio({ botCobraSinal: false }) as never);

    await enviar('1');

    expect(mockCriarReserva).not.toHaveBeenCalled();
    expect(mockAppointmentCreate).toHaveBeenCalled();
    expect(enviadas()).toEqual(['Agendamento confirmado']);
  });

  it('opção ligada e chave Pix removida agenda como antes e avisa no log', async () => {
    sessaoEscolhendoHorario();
    vi.mocked(prisma.business.findFirst).mockResolvedValue(negocio({ pixKey: null, pixKeyType: null }) as never);

    await enviar('1');

    expect(mockCriarReserva).not.toHaveBeenCalled();
    expect(mockAppointmentCreate).toHaveBeenCalled();
    expect(enviadas()).toEqual(['Agendamento confirmado']);
    expect(mockLoggerWarn).toHaveBeenCalledWith(expect.objectContaining({ businessId: NEGOCIO }), expect.stringContaining('chave Pix'));
  });

  it('conflito oferece outros horários, como hoje', async () => {
    sessaoEscolhendoHorario();
    mockCriarReserva.mockRejectedValue(new ConflictError('Este horário acabou de ser reservado por outra pessoa'));

    await enviar('1');

    expect(mockAppointmentCreate).not.toHaveBeenCalled();
    expect(enviadas()[0]).toBe(DEFAULT_BOT_CONFIG.slot_taken_message);
    expect(mockUpdateSession).toHaveBeenCalledWith(NUMERO, NEGOCIO, STEPS.CHOOSE_TIME, expect.objectContaining({ availableSlots: ['10:00', '10:30'] }));
  });

  it('falha ao ler a opção (coluna ainda sem migração) agenda como antes, avisa no log e não manda booking_failed_message', async () => {
    sessaoEscolhendoHorario();
    vi.mocked(prisma.business.findFirst).mockRejectedValue(new Error('P2022 coluna bot_cobra_sinal não existe'));

    await enviar('1');

    expect(mockCriarReserva).not.toHaveBeenCalled();
    expect(mockAppointmentCreate).toHaveBeenCalled();
    expect(enviadas()).toEqual(['Agendamento confirmado']);
    expect(enviadas().some((m) => m === DEFAULT_BOT_CONFIG.booking_failed_message)).toBe(false);
    expect(mockLoggerWarn).toHaveBeenCalled();
  });

  it('no simulador, falha ao ler a opção cai na confirmação simulada normal', async () => {
    sessaoEscolhendoHorario({ clientId: 'simulador' });
    vi.mocked(prisma.business.findFirst).mockRejectedValue(new Error('P2022'));

    await enviar('1', { simulationMode: true });

    expect(mockCriarReserva).not.toHaveBeenCalled();
    expect(enviadas().some((m) => m === DEFAULT_BOT_CONFIG.booking_failed_message)).toBe(false);
    expect(enviadas().some((m) => m.includes('Agendamento confirmado'))).toBe(true);
  });

  it('remarcação nunca cobra o sinal', async () => {
    sessaoEscolhendoHorario({ rescheduleAppointmentId: 'apt-orig' });
    mockAppointmentUpdate.mockResolvedValue({ id: 'apt-orig', status: 'confirmado' });

    await enviar('1');

    expect(mockCriarReserva).not.toHaveBeenCalled();
    expect(mockAppointmentUpdate).toHaveBeenCalled();
  });

  it('no simulador mostra a mensagem com código de teste e AVISO_TESTE e não grava', async () => {
    sessaoEscolhendoHorario({ clientId: 'simulador' });

    await enviar('1', { simulationMode: true });

    expect(mockCriarReserva).not.toHaveBeenCalled();
    expect(mockAppointmentCreate).not.toHaveBeenCalled();
    expect(mockCancelarPendente).not.toHaveBeenCalled();
    const msgs = enviadas();
    expect(msgs[0]).toContain('R$ 20,00');
    expect(msgs.at(-1)).toContain(AVISO_TESTE);
    expect(msgs.join('\n')).toMatch(/teste/i);
    expect(msgs.some((m) => m.includes('Agendamento confirmado'))).toBe(false);
    expect(mockUpdateSession).not.toHaveBeenCalledWith(NUMERO, NEGOCIO, STEPS.AWAITING_DEPOSIT, expect.anything());
    expect(mockDeleteSession).toHaveBeenCalledWith(NUMERO, NEGOCIO);
  });
});

describe('awaiting_deposit', () => {
  const emEspera = () => mockGetSession.mockResolvedValue({
    step: STEPS.AWAITING_DEPOSIT, data: { appointmentId: 'apt-9', expiresAt: new Date(Date.now() + 20 * 60_000).toISOString() },
  });
  const reservaNoBanco = (o: Record<string, unknown> = {}) =>
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue({
      status: 'aguardando_pagamento', expiresAt: new Date(Date.now() + 20 * 60_000), ...o,
    } as never);

  it('awaiting_deposit: texto livre responde deposit_waiting_message e mantém a sessão', async () => {
    emEspera();
    reservaNoBanco();

    const r = await enviar('paguei');

    expect(r).toEqual(expect.objectContaining({ ok: true }));
    expect(enviadas()).toHaveLength(1);
    expect(enviadas()[0]).toContain('Ainda estamos aguardando o pagamento do sinal');
    expect(enviadas()[0]).toContain('20 min');
    expect(mockDeleteSession).not.toHaveBeenCalled();
    expect(mockCriarReserva).not.toHaveBeenCalled();
    expect(mockAppointmentCreate).not.toHaveBeenCalled();
    expect(mockCancelarPendente).not.toHaveBeenCalled();
  });

  it('awaiting_deposit: 0 cancela a reserva, responde deposit_cancelled_message e apaga a sessão', async () => {
    emEspera();
    reservaNoBanco();

    await enviar('0');

    expect(mockCancelarPendente).toHaveBeenCalledWith('apt-9', NEGOCIO);
    expect(mockAppointmentUpdateStatus).not.toHaveBeenCalled();
    expect(enviadas()).toEqual([DEFAULT_BOT_CONFIG.deposit_cancelled_message]);
    expect(mockDeleteSession).toHaveBeenCalledWith(NUMERO, NEGOCIO);
  });

  it('awaiting_deposit: 0 logo depois de o sinal ser pago não cancela nem manda deposit_cancelled_message', async () => {
    emEspera();
    vi.mocked(prisma.appointment.findFirst)
      .mockResolvedValueOnce({ status: 'aguardando_pagamento', expiresAt: new Date(Date.now() + 20 * 60_000) } as never)
      .mockResolvedValueOnce({ status: 'confirmado', expiresAt: null } as never);
    mockCancelarPendente.mockResolvedValue(false);

    await enviar('0');

    expect(mockAppointmentUpdateStatus).not.toHaveBeenCalled();
    expect(enviadas()).not.toContain(DEFAULT_BOT_CONFIG.deposit_cancelled_message);
    expect(enviadas()).not.toContain(DEFAULT_BOT_CONFIG.cancel_failed_message);
    expect(mockDeleteSession).toHaveBeenCalledWith(NUMERO, NEGOCIO);
  });

  it('awaiting_deposit: 0 quando a rotina já cancelou a reserva reabre o menu, sem cancel_failed_message', async () => {
    emEspera();
    vi.mocked(prisma.appointment.findFirst)
      .mockResolvedValueOnce({ status: 'aguardando_pagamento', expiresAt: new Date(Date.now() + 20 * 60_000) } as never)
      .mockResolvedValueOnce({ status: 'cancelado', expiresAt: null } as never);
    mockCancelarPendente.mockResolvedValue(false);

    await enviar('0');

    expect(enviadas()).toHaveLength(1);
    expect(enviadas()[0]).not.toBe(DEFAULT_BOT_CONFIG.cancel_failed_message);
    expect(enviadas()[0]).not.toBe(DEFAULT_BOT_CONFIG.deposit_cancelled_message);
    expect(mockDeleteSession).toHaveBeenCalledWith(NUMERO, NEGOCIO);
    expect(mockCreateSession).toHaveBeenCalledWith(NUMERO, NEGOCIO);
  });

  describe('tempo limite da sessão', () => {
    const haMinutos = (m: number) => new Date(Date.now() - m * 60_000);

    it('espera do sinal com a sessão parada há 45 min e prazo no futuro continua respondendo', async () => {
      mockGetSession.mockResolvedValue({
        step: STEPS.AWAITING_DEPOSIT, updatedAt: haMinutos(45),
        data: { appointmentId: 'apt-9', expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() },
      });
      vi.mocked(prisma.appointment.findFirst).mockResolvedValue({ status: 'aguardando_pagamento', expiresAt: new Date(Date.now() + 15 * 60_000) } as never);

      const r = await enviar('paguei');
      expect(r).toEqual(expect.objectContaining({ ok: true, ignored: false }));
      expect(enviadas()[0]).toContain('Ainda estamos aguardando o pagamento do sinal');

      await enviar('0');
      expect(mockCancelarPendente).toHaveBeenCalledWith('apt-9', NEGOCIO);
      expect(enviadas()).toContain(DEFAULT_BOT_CONFIG.deposit_cancelled_message);
    });

    it('outro step com a sessão parada há 45 min expira como antes', async () => {
      mockGetSession.mockResolvedValue({ step: 'choose_time', updatedAt: haMinutos(45), data: { availableSlots: ['10:00'] } });

      const r = await enviar('1');

      expect(r).toEqual(expect.objectContaining({ ignored: true, reason: 'no_greeting_no_session' }));
      expect(mockDeleteSession).toHaveBeenCalledWith(NUMERO, NEGOCIO);
      expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
    });

    it('espera do sinal com o prazo vencido e a sessão parada expira', async () => {
      mockGetSession.mockResolvedValue({
        step: STEPS.AWAITING_DEPOSIT, updatedAt: haMinutos(45),
        data: { appointmentId: 'apt-9', expiresAt: haMinutos(5).toISOString() },
      });

      const r = await enviar('paguei');

      expect(r).toEqual(expect.objectContaining({ ignored: true, reason: 'no_greeting_no_session' }));
      expect(mockCancelarPendente).not.toHaveBeenCalled();
      expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
    });
  });

  it('awaiting_deposit: reserva já expirada ou confirmada apaga a sessão e reabre o menu', async () => {
    for (const situacao of [
      { status: 'aguardando_pagamento', expiresAt: new Date(Date.now() - 60_000) },
      { status: 'confirmado', expiresAt: null },
      { status: 'cancelado', expiresAt: null },
    ]) {
      vi.clearAllMocks();
      mockSendWhatsAppMessage.mockReset().mockResolvedValue(true);
      mockGetBotConfig.mockResolvedValue({ ...DEFAULT_BOT_CONFIG });
      emEspera();
      reservaNoBanco(situacao);

      await enviar('e agora?');

      expect(mockDeleteSession).toHaveBeenCalledWith(NUMERO, NEGOCIO);
      expect(mockCreateSession).toHaveBeenCalledWith(NUMERO, NEGOCIO);
      expect(mockCancelarPendente).not.toHaveBeenCalled();
      expect(enviadas()).toHaveLength(1);
      expect(enviadas()[0]).not.toContain('aguardando o pagamento');
    }
  });
});

describe('textos padrão do sinal orientam quem já pagou', () => {
  it('prazo esgotado: quem já pagou responde e o negócio confere', () => {
    expect(DEFAULT_BOT_CONFIG.deposit_expired_message).toContain('Se você já fez o pagamento, responda aqui que {nome_negocio} confere para você.');
  });

  it('espera: quem já pagou só aguarda a confirmação, mantendo prazo e cancelamento', () => {
    const t = DEFAULT_BOT_CONFIG.deposit_waiting_message;
    expect(t).toContain('Se você já pagou, é só aguardar a confirmação, que chega por aqui.');
    expect(t).toContain('{prazo}');
    expect(t).toContain('0️⃣ Cancelar a pré-reserva');
  });
});
