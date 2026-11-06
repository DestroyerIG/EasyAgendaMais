import { vi, describe, it, beforeEach, expect } from 'vitest';

const mockPoolQuery = vi.hoisted(() => vi.fn());
const mockSendWhatsAppMessage = vi.hoisted(() => vi.fn());
const mockGetWhatsAppStatus = vi.hoisted(() => vi.fn());
const mockGetSession = vi.hoisted(() => vi.fn());
const mockIsSessionExpired = vi.hoisted(() => vi.fn());
const mockCreateSession = vi.hoisted(() => vi.fn());
const mockUpdateSession = vi.hoisted(() => vi.fn());
const mockDeleteSession = vi.hoisted(() => vi.fn());
const mockGetBotConfig = vi.hoisted(() => vi.fn());
const mockGetMenuOptions = vi.hoisted(() => vi.fn());
const mockGetBusinessBusinessSettings = vi.hoisted(() => vi.fn());
const mockIsWithinBusinessHours = vi.hoisted(() => vi.fn());
const mockIsBusinessOpenOnDate = vi.hoisted(() => vi.fn());
const mockGenerateAvailableTimeSlots = vi.hoisted(() => vi.fn());
const mockFormatBusinessHoursRange = vi.hoisted(() => vi.fn());
const mockAppointmentServiceCreate = vi.hoisted(() => vi.fn());
const mockAppointmentServiceUpdate = vi.hoisted(() => vi.fn());

vi.mock('../modules/conta/estadoConta.service.js', () => ({ estadoContaService: { doNegocio: vi.fn().mockResolvedValue({ tipo: 'ativa' }), limparCache: vi.fn() } }));
vi.mock('../config/database.js', () => ({
  default: {
    query: mockPoolQuery,
  },
}));

// Shim Prisma so existing assertions on mockPoolQuery still match.
// flowService + businessSettingsRepository moved from raw pool.query to
// prisma.$queryRaw(Prisma.sql`…`); we proxy that through the same mock by
// extracting the SQL text from the Prisma.Sql object.
vi.mock('../config/prisma.js', () => {
  const queryRaw = vi.fn(async (input: unknown) => {
    const sqlObj = input as { text?: string; sql?: string; values?: unknown[] } | string;
    const text =
      typeof sqlObj === 'string'
        ? sqlObj
        : (sqlObj?.text ?? sqlObj?.sql ?? String(sqlObj));
    const values =
      typeof sqlObj === 'object' && sqlObj && Array.isArray((sqlObj as { values?: unknown[] }).values)
        ? (sqlObj as { values: unknown[] }).values
        : [];
    const result = await mockPoolQuery(text, values);
    if (Array.isArray(result)) return result;
    if (result && typeof result === 'object' && 'rows' in result) {
      return (result as { rows: unknown[] }).rows ?? [];
    }
    return [];
  });

  const stubResolveNull = () => vi.fn().mockResolvedValue(null);
  const stubResolveEmpty = () => vi.fn().mockResolvedValue([]);
  const stubResolveZero = () => vi.fn().mockResolvedValue(0);

  return {
    prisma: {
      $queryRaw: queryRaw,
      $executeRaw: queryRaw,
      $queryRawUnsafe: queryRaw,
      $executeRawUnsafe: queryRaw,
      $transaction: vi.fn(async (cb: unknown) => {
        if (typeof cb === 'function') return (cb as (tx: unknown) => unknown)({ $queryRaw: queryRaw });
        return cb;
      }),
      $connect: vi.fn().mockResolvedValue(undefined),
      $disconnect: vi.fn().mockResolvedValue(undefined),
      business: {
        findFirst: stubResolveNull(),
        findUnique: stubResolveNull(),
        findMany: stubResolveEmpty(),
      },
      client: {
        findFirst: stubResolveNull(),
        findUnique: stubResolveNull(),
        update: stubResolveNull(),
        create: stubResolveNull(),
        upsert: stubResolveNull(),
      },
      service: {
        findFirst: stubResolveNull(),
        findMany: stubResolveEmpty(),
      },
      professional: {
        findFirst: stubResolveNull(),
        findMany: stubResolveEmpty(),
      },
      appointment: {
        findFirst: stubResolveNull(),
        findMany: stubResolveEmpty(),
        create: stubResolveNull(),
        update: stubResolveNull(),
        count: stubResolveZero(),
      },
      whatsappRating: { upsert: vi.fn().mockResolvedValue(null) },
      whatsappSession: {
        findFirst: stubResolveNull(),
        findMany: stubResolveEmpty(),
        create: stubResolveNull(),
        update: stubResolveNull(),
        updateMany: stubResolveZero(),
        deleteMany: stubResolveZero(),
      },
    },
  };
});

const mockAoCancelar = vi.hoisted(() => vi.fn());
vi.mock('../modules/whatsappAutomacoes/gatilhos.service.js', () => ({
  automacoesGatilhos: { aoCancelar: mockAoCancelar },
}));

const mockPedirHumano = vi.hoisted(() => vi.fn());
vi.mock('../modules/whatsappInbox/inbox.recorder.js', () => ({
  inboxRecorder: { pedirAtendimentoHumano: mockPedirHumano },
}));

vi.mock('../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
}));

vi.mock('../services/whatsapp/whatsappMessageService.js', () => ({
  sendWhatsAppMessage: mockSendWhatsAppMessage,
  buildWelcomeMessage: vi.fn((_h: unknown, _o: unknown, _n: unknown, contexto?: string) => (contexto ? `menu ${contexto}` : 'menu')),
  formatMessage: vi.fn((message: unknown) => message),
}));

vi.mock('../services/whatsappClient.js', () => ({
  getWhatsAppStatus: mockGetWhatsAppStatus,
  getWhatsAppStatusByInstance: mockGetWhatsAppStatus,
  getConnectedNumberCached: vi.fn(() => {
    const status = mockGetWhatsAppStatus();
    return status?.connectedNumber || null;
  }),
}));

vi.mock('../services/whatsapp/whatsappSessionService.js', () => ({
  getSession: mockGetSession,
  isSessionExpired: mockIsSessionExpired,
  createSession: mockCreateSession,
  updateSession: mockUpdateSession,
  deleteSession: mockDeleteSession,
}));

vi.mock('../services/whatsapp/whatsappConfigService.js', () => ({
  getBotConfig: mockGetBotConfig,
  getMenuOptions: mockGetMenuOptions,
}));

vi.mock('../services/scheduleSettingsService.js', () => ({
  getBusinessScheduleSettings: mockGetBusinessBusinessSettings,
  isWithinBusinessHours: mockIsWithinBusinessHours,
  isBusinessOpenOnDate: mockIsBusinessOpenOnDate,
  generateAvailableTimeSlots: mockGenerateAvailableTimeSlots,
  formatBusinessHoursRange: mockFormatBusinessHoursRange,
}));

vi.mock('../services/appointmentService.js', () => ({
  appointmentService: {
    create: mockAppointmentServiceCreate,
    update: mockAppointmentServiceUpdate,
  },
}));

const {
  handleIncomingMessage,
  handleWebhook,
} = await import('../services/whatsapp/whatsappFlowService.js');
const { prisma } = await import('../config/prisma.js');
const { ConflictError } = await import('../utils/errors.js');
const { AVISO_TESTE } = await import('../services/whatsapp/whatsappConstants.js');
const { agendamentoExemplo } = await import('../services/whatsapp/whatsappBookingService.js');
const { formatMessage } = await import('../services/whatsapp/whatsappMessageService.js');

describe('whatsappFlowService guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mockPoolQuery (clears the .mockResolvedValueOnce queue).
    // Other mocks only need their call history cleared.
    mockPoolQuery.mockReset();
    delete process.env.WHATSAPP_DEFAULT_BUSINESS_ID;
    delete process.env.WHATSAPP_INSTANCE_BUSINESS_MAP;
    mockPoolQuery.mockResolvedValue({ rows: [] });
    mockSendWhatsAppMessage.mockResolvedValue(true);
    mockAppointmentServiceUpdate.mockReset();
    mockAppointmentServiceCreate.mockResolvedValue({
      id: 'apt-1',
      status: 'confirmado',
    });
    mockGetWhatsAppStatus.mockReturnValue({
      connectedNumber: '5511888888888',
    });
    mockGetSession.mockResolvedValue(null);
    mockIsSessionExpired.mockReturnValue(false);
    mockCreateSession.mockResolvedValue(undefined);
    mockUpdateSession.mockResolvedValue(undefined);
    mockDeleteSession.mockResolvedValue(undefined);
    mockGetBotConfig.mockResolvedValue({
      invalid_option_message: 'Opcao invalida.',
      no_slots_message: 'Sem horarios disponiveis.',
      confirmation_message: 'Agendamento confirmado',
      session_expired_message: 'Sessao expirada',
      end_session_message: 'Atendimento encerrado',
    });
    mockGetMenuOptions.mockResolvedValue([{ label: 'Agendar um horario', emoji: '📅' }]);
    mockGetBusinessBusinessSettings.mockResolvedValue({
      openingTime: '08:00',
      closingTime: '18:00',
      slotIntervalMinutes: 30,
      allowWalkins: false,
      autoConfirmAppointments: true,
      timezone: 'America/Sao_Paulo',
    });
    mockIsWithinBusinessHours.mockReturnValue(true);
    mockIsBusinessOpenOnDate.mockReturnValue(true);
    mockGenerateAvailableTimeSlots.mockReturnValue([]);
    mockFormatBusinessHoursRange.mockReturnValue('08:00 as 18:00');
  });

  it('returns ambiguous_phone when webhook payload has @lid and no trusted fallback', async () => {
    const payload = {
      key: {
        remoteJid: '5511991111111@lid',
      },
    };

    const result = await handleIncomingMessage(payload, 'oi', {
      eventName: 'messages-upsert',
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        ignored: true,
        reason: 'ambiguous_phone',
      })
    );
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it('ignora evento messages-set no webhook handler (nao necessario para o fluxo principal)', async () => {
    const req = {
      body: {
        event: 'messages.set',
        data: {
          messages: Array.from({ length: 3 }, (_, i) => ({
            key: {
              id: `set-${i}`,
              remoteJid: '5511777777777@s.whatsapp.net',
              fromMe: false,
            },
          })),
        },
      },
    };

    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await handleWebhook(req as unknown as Parameters<typeof handleWebhook>[0], res as unknown as Parameters<typeof handleWebhook>[1]);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        message: 'Evento ignorado: nao e mensagem de entrada.',
      })
    );
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('nao processa quando tenant nao pode ser resolvido sem fallback inseguro', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    const result = await handleIncomingMessage('5511777777777', 'oi', {
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        ignored: true,
        reason: 'business_not_resolved',
      })
    );
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('resolve tenant via mapeamento da instancia quando connectedNumber estiver nulo', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });
    process.env.WHATSAPP_INSTANCE_BUSINESS_MAP = 'easyagenda=tenant-map';
    mockGetWhatsAppStatus.mockReturnValue({ connectedNumber: null });
    mockIsWithinBusinessHours.mockReturnValue(false);

    const payload = {
      event: 'messages-upsert',
      instance: {
        instanceName: 'easyagenda',
      },
      key: {
        remoteJid: '5511777777777@s.whatsapp.net',
        fromMe: false,
      },
      message: {
        conversation: 'oi',
      },
    };

    const result = await handleIncomingMessage(payload, 'oi', {
      eventName: 'messages-upsert',
      now: new Date('2026-04-18T07:30:00-03:00'),
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        ignored: false,
      })
    );

    const instanceDbLookupCall = (mockPoolQuery.mock.calls as unknown as [string, unknown[]][]).find(
      ([query]) =>
        typeof query === 'string' &&
        query.includes('lower(btrim(whatsapp_instance_name))')
    );

    expect(instanceDbLookupCall).toBeDefined();
    expect(mockGetBusinessBusinessSettings).toHaveBeenCalledWith('tenant-map');

    const tenantLookupCall = (mockPoolQuery.mock.calls as unknown as [string, unknown[]][]).find(
      ([query]) =>
        typeof query === 'string' &&
        (
          query.includes('regexp_replace(COALESCE(whatsapp') ||
          query.includes('FROM whatsapp_sessions')
        )
    );

    expect(tenantLookupCall).toBeUndefined();
  });

  it('resolve tenant via instanceName no banco como fonte primaria', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: 'tenant-db', name: 'Professional DB', whatsapp_instance_name: 'easyagenda' }],
    });
    mockGetWhatsAppStatus.mockReturnValue({ connectedNumber: null });
    mockIsWithinBusinessHours.mockReturnValue(false);

    const payload = {
      event: 'messages-upsert',
      instanceName: 'easyagenda',
      key: {
        remoteJid: '5511777777777@s.whatsapp.net',
        fromMe: false,
      },
      message: {
        conversation: 'oi',
      },
    };

    const result = await handleIncomingMessage(payload, 'oi', {
      eventName: 'messages-upsert',
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        ignored: false,
      })
    );
    expect(mockGetBusinessBusinessSettings).toHaveBeenCalledWith('tenant-db');

    const instanceDbLookupCall = (mockPoolQuery.mock.calls as unknown as [string, unknown[]][]).find(
      ([query]) =>
        typeof query === 'string' &&
        query.includes('lower(btrim(whatsapp_instance_name))')
    );

    expect(instanceDbLookupCall).toBeDefined();
  });

  it('resolve tenant via owner quando instanceName nao vier no payload', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: 'tenant-owner', name: 'Professional Owner', whatsapp_instance_name: 'owner-inst' }],
    });
    mockGetWhatsAppStatus.mockReturnValue({ connectedNumber: null });
    mockIsWithinBusinessHours.mockReturnValue(false);

    const payload = {
      event: 'messages-upsert',
      owner: 'owner-inst',
      key: {
        remoteJid: '5511777777777@s.whatsapp.net',
        fromMe: false,
      },
      message: {
        conversation: 'oi',
      },
    };

    const result = await handleIncomingMessage(payload, 'oi', {
      eventName: 'messages-upsert',
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    expect(result).toEqual(expect.objectContaining({ ok: true, ignored: false }));
    expect(mockGetBusinessBusinessSettings).toHaveBeenCalledWith('tenant-owner');
  });

  it('processa inbound real com JID normal, resolve tenant por instanceName e responde saudacao', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: 'tenant-db', name: 'Professional DB', whatsapp_instance_name: 'easyagenda' }],
    });
    mockGetWhatsAppStatus.mockReturnValue({ connectedNumber: '5511888888888' });
    mockIsWithinBusinessHours.mockReturnValue(true);

    const payload = {
      event: 'messages-upsert',
      instanceName: 'easyagenda',
      key: {
        remoteJid: '558399849151@s.whatsapp.net',
        fromMe: false,
      },
      sender: '558396311811@s.whatsapp.net',
      message: {
        conversation: 'Oi',
      },
    };

    const result = await handleIncomingMessage(payload, 'Oi', {
      eventName: 'messages-upsert',
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    expect(result).toEqual(expect.objectContaining({ ok: true, ignored: false }));
    expect(mockGetBusinessBusinessSettings).toHaveBeenCalledWith('tenant-db');
    expect(mockCreateSession).toHaveBeenCalledWith('558399849151', 'tenant-db');
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      '558399849151',
      expect.any(String),
      expect.objectContaining({
        eventName: 'messages-upsert',
        instanceName: 'easyagenda',
      })
    );
  });

  it('aceita inbound real @lid com metadata confiavel mesmo sem participant no payload principal', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: 'tenant-db', name: 'Professional DB', whatsapp_instance_name: 'easyagenda' }],
    });
    mockGetWhatsAppStatus.mockReturnValue({ connectedNumber: '558396311811' });
    mockIsWithinBusinessHours.mockReturnValue(true);

    const payload = {
      event: 'messages-upsert',
      instanceName: 'easyagenda',
      key: {
        remoteJid: '236197968359561@lid',
        fromMe: false,
      },
      sender: '558396311811@s.whatsapp.net',
      message: {
        conversation: 'Olá',
      },
      messageContextInfo: {
        participantPn: '5583970011223',
      },
    };

    const result = await handleIncomingMessage(payload, 'Olá', {
      eventName: 'messages-upsert',
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    expect(result).toEqual(expect.objectContaining({ ok: true, ignored: false }));
    expect(mockCreateSession).toHaveBeenCalledWith('5583970011223', 'tenant-db');
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      '5583970011223',
      expect.any(String),
      expect.objectContaining({
        eventName: 'messages-upsert',
        instanceName: 'easyagenda',
        allowLidDestination: true,
      })
    );
  });

  it('resolve corretamente tenants distintos para instancias diferentes', async () => {
    mockGetWhatsAppStatus.mockReturnValue({ connectedNumber: null });
    mockIsWithinBusinessHours.mockReturnValue(false);

    mockPoolQuery.mockImplementation(async (query: unknown, params: string[] = []) => {
      if (typeof query === 'string' && query.includes('lower(btrim(whatsapp_instance_name))')) {
        if (params[0] === 'inst-a') {
          return { rows: [{ id: 'tenant-a', name: 'Tenant A', whatsapp_instance_name: 'inst-a' }] };
        }

        if (params[0] === 'inst-b') {
          return { rows: [{ id: 'tenant-b', name: 'Tenant B', whatsapp_instance_name: 'inst-b' }] };
        }

        return { rows: [] };
      }

      return { rows: [] };
    });

    const payloadA = {
      event: 'messages-upsert',
      instanceName: 'inst-a',
      key: {
        remoteJid: '5511777777777@s.whatsapp.net',
        fromMe: false,
      },
      message: {
        conversation: 'oi',
      },
    };

    const payloadB = {
      event: 'messages-upsert',
      instanceName: 'inst-b',
      key: {
        remoteJid: '5511888888888@s.whatsapp.net',
        fromMe: false,
      },
      message: {
        conversation: 'oi',
      },
    };

    const resultA = await handleIncomingMessage(payloadA, 'oi', {
      eventName: 'messages-upsert',
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    const resultB = await handleIncomingMessage(payloadB, 'oi', {
      eventName: 'messages-upsert',
      now: new Date('2026-04-18T10:01:00-03:00'),
    });

    expect(resultA).toEqual(expect.objectContaining({ ok: true, ignored: false }));
    expect(resultB).toEqual(expect.objectContaining({ ok: true, ignored: false }));
    expect(mockGetBusinessBusinessSettings).toHaveBeenNthCalledWith(1, 'tenant-a');
    expect(mockGetBusinessBusinessSettings).toHaveBeenNthCalledWith(2, 'tenant-b');
  });

  it('nao mistura tenant por contexto de sessao quando instanceName foi resolvido no banco', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: 'tenant-db', name: 'Professional DB', whatsapp_instance_name: 'easyagenda' }],
    });
    mockGetWhatsAppStatus.mockReturnValue({ connectedNumber: null });
    mockIsWithinBusinessHours.mockReturnValue(false);

    const payload = {
      event: 'messages-upsert',
      instanceName: 'easyagenda',
      key: {
        remoteJid: '5511777777777@s.whatsapp.net',
        fromMe: false,
      },
      message: {
        conversation: 'oi',
      },
    };

    const result = await handleIncomingMessage(payload, 'oi', {
      eventName: 'messages-upsert',
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    expect(result).toEqual(expect.objectContaining({ ok: true, ignored: false }));

    const sessionLookupCall = (mockPoolQuery.mock.calls as unknown as [string, unknown[]][]).find(
      ([query]) => typeof query === 'string' && query.includes('FROM whatsapp_sessions')
    );

    expect(sessionLookupCall).toBeUndefined();
  });

  it('usa tenant resolvido por instanceName no fluxo de agendamento', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: 'tenant-db', name: 'Tenant DB', whatsapp_instance_name: 'inst-agenda' }],
    });

    mockGetSession.mockResolvedValue({
      step: 'choose_time',
      data: {
        availableSlots: ['10:00'],
        selectedDate: '2026-04-20',
        professionalId: 'professional-1',
        clientId: 'client-1',
        serviceId: 'service-1',
        serviceName: 'Corte',
        professionalName: 'Joao',
        servicePrice: 55,
      },
    });

    mockGetWhatsAppStatus.mockReturnValue({ connectedNumber: null });

    const payload = {
      event: 'messages-upsert',
      instanceName: 'inst-agenda',
      key: {
        remoteJid: '5511777777777@s.whatsapp.net',
        fromMe: false,
      },
      message: {
        conversation: '1',
      },
    };

    const result = await handleIncomingMessage(payload, '1', {
      eventName: 'messages-upsert',
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    expect(result).toEqual(expect.objectContaining({ ok: true, ignored: false }));
    expect(mockAppointmentServiceCreate).toHaveBeenCalledWith('tenant-db', {
      clientId: 'client-1',
      professionalId: 'professional-1',
      serviceId: 'service-1',
      date: '2026-04-20',
      time: '10:00',
    }, { source: 'whatsapp' });
  });

  it('falha fechado quando instanceName existe mas nao tem mapeamento no banco nem no legado', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });
    mockGetWhatsAppStatus.mockReturnValue({ connectedNumber: null });

    const payload = {
      event: 'messages-upsert',
      instanceName: 'tenant-inexistente',
      key: {
        remoteJid: '5511777777777@s.whatsapp.net',
        fromMe: false,
      },
      message: {
        conversation: 'oi',
      },
    };

    const result = await handleIncomingMessage(payload, 'oi', {
      eventName: 'messages-upsert',
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        ignored: true,
        reason: 'business_not_resolved',
      })
    );

    const knownNumberLookupCall = (mockPoolQuery.mock.calls as unknown as [string, unknown[]][]).find(
      ([query]) =>
        typeof query === 'string' &&
        query.includes('regexp_replace(COALESCE(whatsapp')
    );

    expect(knownNumberLookupCall).toBeUndefined();
  });

  it('resolve tenant pelo contexto de sessao quando numero conectado estiver indisponivel', async () => {
    mockGetWhatsAppStatus.mockReturnValue({ connectedNumber: null });
    mockIsWithinBusinessHours.mockReturnValue(false);
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ business_id: 'tenant-session' }],
    });

    const result = await handleIncomingMessage('5511777777777', 'oi', {
      now: new Date('2026-04-18T07:30:00-03:00'),
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        ignored: false,
      })
    );
    expect(mockGetBusinessBusinessSettings).toHaveBeenCalledWith('tenant-session');

    const sessionLookupCall = (mockPoolQuery.mock.calls as unknown as [string, unknown[]][]).find(
      ([query]) => typeof query === 'string' && query.includes('FROM whatsapp_sessions')
    );

    expect(sessionLookupCall).toBeDefined();
  });

  it('processa simulador com businessId explicito sem depender de connectedNumber', async () => {
    mockGetWhatsAppStatus.mockReturnValue({
      connectedNumber: null,
    });
    mockIsWithinBusinessHours.mockReturnValue(false);

    const result = await handleIncomingMessage('5511777777777', 'oi', {
      simulationMode: true,
      businessId: 'tenant-sim',
      businessContextSource: 'payload',
      now: new Date('2026-04-18T07:30:00-03:00'),
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        ignored: false,
      })
    );
    expect(mockGetBusinessBusinessSettings).toHaveBeenCalledWith('tenant-sim');

    const tenantLookupCall = (mockPoolQuery.mock.calls as unknown as [string, unknown[]][]).find(
      ([query]) =>
        typeof query === 'string' &&
        query.includes('regexp_replace(COALESCE(whatsapp')
    );

    expect(tenantLookupCall).toBeUndefined();
  });

  it('returns ambiguous_phone for @lid payload when no trusted fallback can be resolved', async () => {
    mockGetWhatsAppStatus.mockReturnValue({
      connectedNumber: null,
    });

    const payload = {
      key: {
        remoteJid: '236197968359561@lid',
      },
      sender: '5511888888888@s.whatsapp.net',
      from: '5511777777777@s.whatsapp.net',
      message: {
        conversation: 'oi',
      },
    };

    const result = await handleIncomingMessage(payload, 'oi', {
      eventName: 'messages-upsert',
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        ignored: true,
        reason: 'ambiguous_phone',
      })
    );
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it('returns self_target when payload fromMe arrives as string true', async () => {
    const payload = {
      key: {
        remoteJid: '5511777777777@s.whatsapp.net',
        fromMe: 'true',
      },
      message: {
        conversation: 'oi',
      },
    };

    const result = await handleIncomingMessage(payload, 'oi', {
      eventName: 'messages-upsert',
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        ignored: true,
        reason: 'from_me',
      })
    );
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it('returns ambiguous_phone when sender is numeric-only and no trusted jid exists', async () => {
    const payload = {
      sender: '5511777777777',
    };

    const result = await handleIncomingMessage(payload, 'oi');

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        ignored: true,
        reason: 'ambiguous_phone',
      })
    );
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('returns self_target for direct input equal to connected instance', async () => {
    const result = await handleIncomingMessage('5511888888888', 'oi', {
      eventName: 'messages-upsert',
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        ignored: true,
        reason: 'self_reply_blocked',
      })
    );
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it('returns self_target when pre-extracted phone matches known instance numbers', async () => {
    mockGetWhatsAppStatus.mockReturnValue({
      connectedNumber: null,
    });

    const result = await handleIncomingMessage(
      {
        key: {
          remoteJid: '5511777777777@s.whatsapp.net',
        },
      },
      'oi',
      {
        preExtractedPhone: '5511666666666',
        preExtractedText: 'oi',
        preExtractedInstanceNumbers: ['5511666666666'],
      }
    );

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        ignored: true,
        reason: 'self_reply_blocked',
      })
    );
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it('responde fora do expediente quando mensagem chega as 07:30', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'tenant-1' }] });
    mockIsWithinBusinessHours.mockReturnValue(false);

    const result = await handleIncomingMessage('5511777777777', 'oi', {
      now: new Date('2026-04-18T07:30:00-03:00'),
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        ignored: false,
      })
    );

    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      '5511777777777',
      expect.stringContaining('08:00 as 18:00'),
      expect.objectContaining({
        knownInstanceNumbers: ['5511888888888'],
      })
    );
  });

  it('responde dentro do expediente quando mensagem chega as 10:00', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ id: 'tenant-1' }] })
      .mockResolvedValueOnce({ rows: [{ name: 'Professional Prime' }] });

    mockIsWithinBusinessHours.mockReturnValue(true);

    const result = await handleIncomingMessage('5511777777777', 'oi', {
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        ignored: false,
      })
    );

    const [, sentMessage] = (mockSendWhatsAppMessage.mock.calls[0] as [string, string]);
    expect(sentMessage).toContain('Hoje atendemos até as 18:00');
    expect(sentMessage).not.toContain('Olá! Posso te ajudar');
    expect(sentMessage).toContain('menu');
  });

  it('detecta saudacao com variacao de caixa e espacos e reinicia o fluxo de forma controlada', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ id: 'tenant-1' }] })
      .mockResolvedValueOnce({ rows: [{ name: 'Professional Prime' }] });
    mockIsWithinBusinessHours.mockReturnValue(true);
    mockGetSession.mockResolvedValueOnce({
      step: 'choose_service',
      data: { serviceId: 'svc-1' },
    });

    const result = await handleIncomingMessage('5511777777777', '   OIII   ', {
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    expect(result).toEqual(expect.objectContaining({ ok: true, ignored: false }));
    expect(mockDeleteSession).toHaveBeenCalledWith('5511777777777', 'tenant-1');
    expect(mockCreateSession).toHaveBeenCalledWith('5511777777777', 'tenant-1');
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      '5511777777777',
      expect.stringContaining('menu'),
      expect.any(Object)
    );
  });

  it('processa inbound @lid real com sender da instancia e participantPn flattenizado, disparando saudacao', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ id: 'tenant-1', name: 'Professional Prime', whatsapp_instance_name: 'easyagenda' }] })
      .mockResolvedValueOnce({ rows: [{ name: 'Professional Prime' }] });
    mockIsWithinBusinessHours.mockReturnValue(true);

    const payload = {
      event: 'messages-upsert',
      instanceName: 'easyagenda',
      key: {
        remoteJid: '236197968359561@lid',
        fromMe: false,
      },
      message: {
        conversation: 'Olá',
      },
      messageContextInfo: {
        participantPn: '5583970011223',
      },
      sender: '558396311811@s.whatsapp.net',
    };

    const result = await handleIncomingMessage(payload, 'Olá', {
      eventName: 'messages-upsert',
      preExtractedInstanceNumbers: ['558396311811'],
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    expect(result).toEqual(expect.objectContaining({ ok: true, ignored: false }));
    expect(mockCreateSession).toHaveBeenCalledWith('5583970011223', 'tenant-1');
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      '5583970011223',
      expect.stringContaining('menu'),
      expect.objectContaining({
        remoteJidOriginal: '236197968359561@lid',
        eventName: 'messages-upsert',
        instanceName: 'easyagenda',
      })
    );
  });

  it.each([
    'Oi',
    'Olá',
    'ola',
    'bom dia',
    'boa tarde',
    'boa noite',
    'iae',
    'eai',
    'opa',
    'fala',
    'tudo bem',
  ])('dispara menu inicial para saudacao "%s"', async (greeting) => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ id: 'tenant-1' }] })
      .mockResolvedValueOnce({ rows: [{ name: 'Professional Prime' }] });
    mockIsWithinBusinessHours.mockReturnValue(true);

    const result = await handleIncomingMessage('5511777777777', greeting, {
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    expect(result).toEqual(expect.objectContaining({ ok: true, ignored: false }));
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      '5511777777777',
      expect.stringContaining('menu'),
      expect.any(Object)
    );
  });

  it.each([
    ['ok'],
    ['1'],
  ])('nao abre menu automaticamente sem sessao quando recebe "%s"', async (input) => {
    process.env.WHATSAPP_DEFAULT_BUSINESS_ID = 'tenant-1';
    mockGetWhatsAppStatus.mockReturnValue({ connectedNumber: null });
    mockIsWithinBusinessHours.mockReturnValue(true);
    mockGetSession.mockResolvedValue(null);
    mockPoolQuery.mockResolvedValue({ rows: [] });

    const result = await handleIncomingMessage('5511777777777', input, {
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        ignored: true,
        reason: 'no_greeting_no_session',
      })
    );
    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('nao reabre menu automaticamente quando a sessao expirou e a nova mensagem nao e saudacao', async () => {
    process.env.WHATSAPP_DEFAULT_BUSINESS_ID = 'tenant-1';
    mockGetWhatsAppStatus.mockReturnValue({ connectedNumber: null });
    mockIsWithinBusinessHours.mockReturnValue(true);
    mockGetSession.mockResolvedValue({
      step: 'menu',
      data: {},
    });
    mockIsSessionExpired.mockReturnValue(true);

    const result = await handleIncomingMessage('5511777777777', 'ok', {
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        ignored: true,
        reason: 'no_greeting_no_session',
      })
    );
    expect(mockDeleteSession).toHaveBeenCalledWith('5511777777777', 'tenant-1');
    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('reabre menu com saudacao apos sessao expirada', async () => {
    process.env.WHATSAPP_DEFAULT_BUSINESS_ID = 'tenant-1';
    mockGetWhatsAppStatus.mockReturnValue({ connectedNumber: null });
    mockIsWithinBusinessHours.mockReturnValue(true);
    mockGetSession.mockResolvedValue({
      step: 'menu',
      data: {},
    });
    mockIsSessionExpired.mockReturnValue(true);
    mockPoolQuery.mockImplementation(async (query: unknown) => {
      if (typeof query === 'string' && query.includes('SELECT name FROM businesses')) {
        return { rows: [{ name: 'Professional Prime' }] };
      }

      return { rows: [] };
    });

    const result = await handleIncomingMessage('5511777777777', 'Oi', {
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    expect(result).toEqual(expect.objectContaining({ ok: true, ignored: false }));
    expect(mockDeleteSession).toHaveBeenCalledWith('5511777777777', 'tenant-1');
    expect(mockCreateSession).toHaveBeenCalledWith('5511777777777', 'tenant-1');
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      '5511777777777',
      expect.stringContaining('menu'),
      expect.any(Object)
    );
  });

  it('encerra atendimento normalmente quando a sessao ativa escolhe a opcao de encerrar', async () => {
    process.env.WHATSAPP_DEFAULT_BUSINESS_ID = 'tenant-1';
    mockGetWhatsAppStatus.mockReturnValue({ connectedNumber: null });
    mockIsWithinBusinessHours.mockReturnValue(true);
    mockGetSession.mockResolvedValue({
      step: 'menu',
      data: {},
    });
    mockIsSessionExpired.mockReturnValue(false);
    mockGetMenuOptions.mockResolvedValue([
      { option_order: 9, handler: 'end_session', type: 'system', active: true, label: 'Encerrar', emoji: '', response_message: null },
    ]);

    const result = await handleIncomingMessage('5511777777777', '1', {
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    expect(result).toEqual(expect.objectContaining({ ok: true, ignored: false }));
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      '5511777777777',
      expect.any(String),
      expect.any(Object)
    );
    expect(mockDeleteSession).toHaveBeenCalledWith('5511777777777', 'tenant-1');
  });

  it('opcao "Falar com um humano" pede atendimento humano para o negocio e o telefone', async () => {
    process.env.WHATSAPP_DEFAULT_BUSINESS_ID = 'tenant-1';
    mockGetWhatsAppStatus.mockReturnValue({ connectedNumber: null });
    mockIsWithinBusinessHours.mockReturnValue(true);
    mockGetSession.mockResolvedValue({ step: 'menu', data: {} });
    mockIsSessionExpired.mockReturnValue(false);
    // Opção 5 desligada: o número digitado segue a lista que a cliente leu.
    mockGetMenuOptions.mockResolvedValue([
      { option_order: 1, handler: 'schedule', type: 'system', active: true, label: 'Agendar', emoji: '' },
      { option_order: 5, handler: 'promotions', type: 'system', active: false, label: 'Promoções', emoji: '' },
      { option_order: 8, handler: 'attendant', type: 'system', active: true, label: 'Humano', emoji: '', response_message: null },
    ]);

    await handleIncomingMessage('5511777777777', '2', {
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    expect(mockPedirHumano).toHaveBeenCalledWith('tenant-1', '5511777777777');
    expect(mockDeleteSession).toHaveBeenCalledWith('5511777777777', 'tenant-1');
  });

  it('com a lista visivel vazia, o menu enviado nao traz numeros e traz a mensagem do atendente', async () => {
    process.env.WHATSAPP_DEFAULT_BUSINESS_ID = 'tenant-1';
    mockGetWhatsAppStatus.mockReturnValue({ connectedNumber: null });
    mockIsWithinBusinessHours.mockReturnValue(true);
    mockGetSession.mockResolvedValue({ step: 'menu', data: {} });
    mockIsSessionExpired.mockReturnValue(false);
    mockGetBotConfig.mockResolvedValue({
      invalid_option_message: 'Opcao invalida.',
      attendant_message: 'attendant_message',
    });
    mockGetMenuOptions.mockResolvedValue([
      { option_order: 1, handler: 'schedule', type: 'system', active: false, label: 'Agendar', emoji: '' },
    ]);

    await handleIncomingMessage('5511777777777', '1', {
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    const enviada = String(mockSendWhatsAppMessage.mock.calls.at(-1)?.[1]);
    expect(enviada).not.toContain('1️⃣');
    expect(enviada).toContain('attendant_message');
  });

  const preencher = (t: string, d: { businessName?: string; instagramHandle?: string } = {}) =>
    t.replace(/\{nome_negocio\}/g, d.businessName ?? '').replace(/\{instagram_handle\}/g, d.instagramHandle ?? '');

  it('promocoes chega com o nome do negocio', async () => {
    process.env.WHATSAPP_DEFAULT_BUSINESS_ID = 'tenant-1';
    mockGetWhatsAppStatus.mockReturnValue({ connectedNumber: null });
    mockIsWithinBusinessHours.mockReturnValue(true);
    mockGetSession.mockResolvedValue({ step: 'menu', data: {} });
    mockIsSessionExpired.mockReturnValue(false);
    mockGetBotConfig.mockResolvedValue({ promotions_message: 'Ofertas da {nome_negocio}', invalid_option_message: 'x' });
    mockGetMenuOptions.mockResolvedValue([
      { option_order: 5, handler: 'promotions', type: 'system', active: true, label: 'Promoções', emoji: '' },
    ]);
    vi.mocked(prisma.business.findFirst).mockResolvedValue({ name: 'Barbearia Alfa', instagramHandle: null } as never);
    vi.mocked(formatMessage).mockImplementationOnce(preencher as never);

    await handleIncomingMessage('5511777777777', '1', { now: new Date('2026-04-18T10:00:00-03:00') });

    expect(mockSendWhatsAppMessage.mock.calls.at(-1)?.[1]).toBe('Ofertas da Barbearia Alfa');
    vi.mocked(prisma.business.findFirst).mockResolvedValue(null as never);
  });

  it('instagram chega com nome e perfil preenchidos, sem @seunegocio', async () => {
    process.env.WHATSAPP_DEFAULT_BUSINESS_ID = 'tenant-1';
    mockGetWhatsAppStatus.mockReturnValue({ connectedNumber: null });
    mockIsWithinBusinessHours.mockReturnValue(true);
    mockGetSession.mockResolvedValue({ step: 'menu', data: {} });
    mockIsSessionExpired.mockReturnValue(false);
    mockGetBotConfig.mockResolvedValue({ instagram_message: '{nome_negocio}: {instagram_handle}', invalid_option_message: 'x' });
    mockGetMenuOptions.mockResolvedValue([
      { option_order: 7, handler: 'instagram', type: 'system', active: true, label: 'Instagram', emoji: '' },
    ]);
    vi.mocked(prisma.business.findFirst).mockResolvedValue({ name: 'Barbearia Alfa', instagramHandle: '@alfa' } as never);
    vi.mocked(formatMessage).mockImplementationOnce(preencher as never);

    await handleIncomingMessage('5511777777777', '1', { now: new Date('2026-04-18T10:00:00-03:00') });

    const enviadas = mockSendWhatsAppMessage.mock.calls.map((c) => String(c[1]));
    expect(enviadas.at(-1)).toBe('Barbearia Alfa: @alfa');
    expect(enviadas.some((m) => m.includes('@seunegocio'))).toBe(false);
    vi.mocked(prisma.business.findFirst).mockResolvedValue(null as never);
  });

  describe('simulador sem gravar', () => {
    const NUMERO = '5511777777777';
    const sim = (texto: string) => handleIncomingMessage(NUMERO, texto, {
      simulationMode: true,
      businessId: 'tenant-1',
      businessContextSource: 'payload',
      now: new Date('2026-04-18T10:00:00-03:00'),
    });
    const clienteReal = { id: 'cliente-real', name: 'Maria Real' };

    const nadaGravado = () => {
      expect(prisma.client.create).not.toHaveBeenCalled();
      expect(prisma.client.update).not.toHaveBeenCalled();
      expect(mockAppointmentServiceCreate).not.toHaveBeenCalled();
      expect(mockAppointmentServiceUpdate).not.toHaveBeenCalled();
      expect(prisma.appointment.update).not.toHaveBeenCalled();
      expect(mockPedirHumano).not.toHaveBeenCalled();
      expect(mockAoCancelar).not.toHaveBeenCalled();
    };

    beforeEach(() => {
      vi.mocked(prisma.client.findFirst).mockResolvedValue(clienteReal as never);
    });

    it('nome digitado fica so na sessao, mesmo com cliente real', async () => {
      mockGetSession.mockResolvedValue({ step: 'ask_name', data: {} });
      vi.mocked(prisma.service.findMany).mockResolvedValueOnce([
        { id: 's1', name: 'Corte', price: 40, durationMinutes: 30 },
      ] as never);

      await sim('Joana Silva');

      nadaGravado();
      expect(mockUpdateSession).toHaveBeenCalledWith(
        NUMERO, 'tenant-1', 'choose_service',
        expect.objectContaining({ clientName: 'Joana Silva' }),
      );
    });

    it('agendamento simulado nao cria nada e a ultima resposta traz o aviso de teste', async () => {
      mockGetSession.mockResolvedValue({
        step: 'choose_time',
        data: {
          availableSlots: ['10:00'], selectedDate: '2026-04-20', professionalId: 'professional-1',
          clientId: 'simulador', serviceId: 'service-1', serviceName: 'Corte',
          professionalName: 'Joao', servicePrice: 55,
        },
      });

      await sim('1');

      nadaGravado();
      expect(String(mockSendWhatsAppMessage.mock.calls.at(-1)?.[1])).toContain(AVISO_TESTE);
      expect(mockDeleteSession).toHaveBeenCalledWith(NUMERO, 'tenant-1');
    });

    it('remarcacao simulada nao atualiza nada e traz o aviso de teste', async () => {
      mockGetSession.mockResolvedValue({
        step: 'choose_time',
        data: {
          availableSlots: ['10:00'], selectedDate: '2026-04-20', professionalId: 'professional-1',
          serviceId: 'service-1', serviceName: 'Corte', professionalName: 'Joao',
          rescheduleAppointmentId: 'simulador',
        },
      });
      mockGetBotConfig.mockResolvedValue({
        invalid_option_message: 'Opcao invalida.',
        reschedule_success_message: 'Remarcado',
      });

      await sim('1');

      nadaGravado();
      expect(String(mockSendWhatsAppMessage.mock.calls.at(-1)?.[1])).toContain(AVISO_TESTE);
    });

    it('remarcacao simulada nao consulta conflito com o id de exemplo', async () => {
      mockGetSession.mockResolvedValue({
        step: 'choose_time',
        data: {
          availableSlots: ['10:00'], selectedDate: '2026-04-20', professionalId: 'professional-1',
          serviceId: 'service-1', serviceName: 'Corte', professionalName: 'Joao',
          rescheduleAppointmentId: 'simulador',
        },
      });
      mockPoolQuery.mockClear();

      await sim('1');

      const params = (mockPoolQuery.mock.calls as unknown as [string, unknown[]][]).flatMap(([, v]) => v ?? []);
      expect(params).not.toContain('simulador');
    });

    it('remarcacao simulada sem profissional ativo avisa em vez de quebrar', async () => {
      mockGetSession.mockResolvedValue({
        step: 'choose_date',
        data: { rescheduleAppointmentId: 'simulador', availableDates: ['2026-04-20'] },
      });
      mockGetBotConfig.mockResolvedValue({
        invalid_option_message: 'Opcao invalida.',
        no_professionals_message: 'Sem profissionais agora.',
      });
      mockPoolQuery.mockClear();

      await sim('1');

      expect(mockPoolQuery).not.toHaveBeenCalled();
      expect(String(mockSendWhatsAppMessage.mock.calls.at(-1)?.[1])).toContain('Sem profissionais agora.');
    });

    it('falar com um humano nao registra pedido de atendimento', async () => {
      mockGetSession.mockResolvedValue({ step: 'menu', data: {} });
      mockGetMenuOptions.mockResolvedValue([
        { option_order: 1, handler: 'attendant', type: 'system', active: true, label: 'Humano', emoji: '', response_message: null },
      ]);

      await sim('1');

      nadaGravado();
      expect(mockSendWhatsAppMessage).toHaveBeenCalled();
    });

    it('cancelar no simulador lista o agendamento de exemplo sem consultar os reais', async () => {
      mockGetSession.mockResolvedValue({ step: 'menu', data: {} });
      mockGetMenuOptions.mockResolvedValue([
        { option_order: 1, handler: 'cancel', type: 'system', active: true, label: 'Cancelar', emoji: '', response_message: null },
      ]);

      await sim('1');

      const consultas = (mockPoolQuery.mock.calls as unknown as [string][]).filter(([q]) => typeof q === 'string' && q.includes('FROM appointments'));
      expect(consultas).toHaveLength(0);
      expect(mockUpdateSession).toHaveBeenCalledWith(
        NUMERO, 'tenant-1', 'confirm_cancel',
        { appointments: [expect.objectContaining({ id: 'simulador' })] },
      );
      nadaGravado();
    });

    it('confirmar o cancelamento simulado nao altera nem dispara automacao', async () => {
      mockGetSession.mockResolvedValue({
        step: 'confirm_cancel',
        data: { appointments: [agendamentoExemplo(new Date('2026-04-18T10:00:00-03:00'))] },
      });

      await sim('1');

      nadaGravado();
      expect(mockSendWhatsAppMessage).toHaveBeenCalled();
    });
  });

  describe('remarcar pelo robo', () => {
    const preencherRemarcacao = (t: string, d: { serviceName?: string; professionalName?: string; dateFormatted?: string; time?: string } = {}) =>
      t.replace(/\{servico\}/g, d.serviceName ?? '')
        .replace(/\{profissional\}/g, d.professionalName ?? '')
        .replace(/\{data\}/g, d.dateFormatted ?? '')
        .replace(/\{horario\}/g, d.time ?? '');

    const sessaoRemarcacao = () => {
      mockPoolQuery.mockResolvedValueOnce({ rows: [{ id: 'tenant-1' }] });
      mockGetSession.mockResolvedValue({
        step: 'choose_time',
        data: {
          availableSlots: ['10:00', '10:30'],
          selectedDate: '2026-04-20',
          professionalId: 'professional-1',
          serviceId: 'service-1',
          serviceName: 'Corte',
          serviceDuration: 30,
          professionalName: 'Joao',
          rescheduleAppointmentId: 'apt-orig',
        },
      });
      mockGetBotConfig.mockResolvedValue({
        invalid_option_message: 'Opcao invalida.',
        no_slots_message: 'Sem horarios disponiveis.',
        reschedule_success_message: '✅ Seu horário foi remarcado!\n\n📋 Serviço: {servico}\n👤 Profissional: {profissional}\n📅 Data: {data}\n⏰ Horário: {horario}',
      });
    };

    it('remarcar move o agendamento com update e nao cria outro', async () => {
      sessaoRemarcacao();
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });
      mockAppointmentServiceUpdate.mockResolvedValue({ id: 'apt-orig', status: 'confirmado' });
      vi.mocked(formatMessage).mockImplementationOnce(preencherRemarcacao as never);

      const result = await handleIncomingMessage('5511777777777', '1', { now: new Date('2026-04-18T10:00:00-03:00') });

      expect(result).toEqual(expect.objectContaining({ ok: true }));
      expect(mockAppointmentServiceUpdate).toHaveBeenCalledWith('apt-orig', 'tenant-1', {
        date: '2026-04-20',
        time: '10:00',
        professionalId: 'professional-1',
      });
      expect(mockAppointmentServiceCreate).not.toHaveBeenCalled();
      const enviada = String(mockSendWhatsAppMessage.mock.calls.at(-1)?.[1]);
      expect(enviada).toContain('remarcado');
      expect(enviada).toContain('Corte');
      expect(enviada).toContain('Joao');
      expect(enviada).toContain('20/04/2026');
      expect(enviada).toContain('10:00');
      expect(enviada).not.toMatch(/\{\w+\}/);
      expect(mockDeleteSession).toHaveBeenCalledWith('5511777777777', 'tenant-1');
    });

    it('o proprio agendamento nao conta como conflito na consulta de horario', async () => {
      sessaoRemarcacao();
      mockPoolQuery.mockResolvedValueOnce({ rows: [] });
      mockAppointmentServiceUpdate.mockResolvedValue({ id: 'apt-orig', status: 'confirmado' });

      await handleIncomingMessage('5511777777777', '1', { now: new Date('2026-04-18T10:00:00-03:00') });

      const chamadas = mockPoolQuery.mock.calls as unknown as [string, unknown[]][];
      const conflito = chamadas.find(([q]) => typeof q === 'string' && q.includes('SELECT id FROM appointments'));
      expect(conflito?.[0]).toMatch(/AND id <> /);
      expect(conflito?.[1]).toContain('apt-orig');
    });

    it('horario tomado no meio da remarcacao deixa o agendamento original intacto', async () => {
      sessaoRemarcacao();
      mockPoolQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ time: '10:00:00' }] });
      mockAppointmentServiceUpdate.mockRejectedValue(new ConflictError('Horário já ocupado para este profissional'));

      const result = await handleIncomingMessage('5511777777777', '1', { now: new Date('2026-04-18T10:00:00-03:00') });

      expect(result).toEqual(expect.objectContaining({ ok: true }));
      expect(mockAppointmentServiceUpdate).toHaveBeenCalledTimes(1);
      expect(mockAppointmentServiceCreate).not.toHaveBeenCalled();
      expect(prisma.appointment.update).not.toHaveBeenCalled();
      expect(mockDeleteSession).not.toHaveBeenCalled();
      const enviadas = mockSendWhatsAppMessage.mock.calls.map((c) => String(c[1]));
      expect(enviadas.some((m) => m.includes('acabou de ser reservado'))).toBe(true);
      expect(mockUpdateSession).toHaveBeenCalledWith(
        '5511777777777',
        'tenant-1',
        'choose_time',
        expect.objectContaining({ rescheduleAppointmentId: 'apt-orig', availableSlots: ['10:30'] }),
      );
    });
  });

  it('persiste agendamento via camada central com payload compativel quando auto confirmacao estiver desativada', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ id: 'tenant-1' }] })
      .mockResolvedValueOnce({ rows: [] });

    mockGetSession.mockResolvedValue({
      step: 'choose_time',
      data: {
        availableSlots: ['10:00'],
        selectedDate: '2026-04-20',
        professionalId: 'professional-1',
        clientId: 'client-1',
        serviceId: 'service-1',
        serviceName: 'Corte',
        professionalName: 'Joao',
        servicePrice: 55,
      },
    });

    mockGetBusinessBusinessSettings.mockResolvedValue({
      openingTime: '08:00',
      closingTime: '18:00',
      slotIntervalMinutes: 30,
      allowWalkins: false,
      autoConfirmAppointments: false,
      timezone: 'America/Sao_Paulo',
    });

    const result = await handleIncomingMessage('5511777777777', '1', {
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    expect(result).toEqual(expect.objectContaining({ ok: true, ignored: false }));
    expect(mockAppointmentServiceCreate).toHaveBeenCalledWith('tenant-1', {
      clientId: 'client-1',
      professionalId: 'professional-1',
      serviceId: 'service-1',
      date: '2026-04-20',
      time: '10:00',
    }, { source: 'whatsapp' });
    expect(mockPoolQuery).toHaveBeenCalledTimes(2);
    const directInsertCall = (mockPoolQuery.mock.calls as unknown as [string, unknown[]][]).find(
      ([query]) => typeof query === 'string' && query.includes('INSERT INTO appointments')
    );
    expect(directInsertCall).toBeUndefined();
    // Conferência do horário usa a mesma regra de ocupação da escolha de data:
    // reserva expirada, concluída ou falta não bloqueia o horário.
    const conflictCall = (mockPoolQuery.mock.calls as unknown as [string, unknown[]][]).find(
      ([query]) => typeof query === 'string' && query.includes('SELECT id FROM appointments')
    );
    expect(conflictCall?.[0]).toContain("status IN ('confirmado', 'em_atendimento')");
    expect(conflictCall?.[0]).toContain("status = 'aguardando_pagamento' AND expires_at > NOW()");
    expect(conflictCall?.[0]).not.toContain("status != 'cancelado'");
    expect(mockDeleteSession).toHaveBeenCalledWith('5511777777777', 'tenant-1');

    const [, sentMessage] = (mockSendWhatsAppMessage.mock.calls[0] as [string, string]);
    expect(sentMessage).toContain('Agendamento confirmado');
    expect(sentMessage).not.toContain('aguardando confirmacao da equipe');
  });

  it('nao confirma sucesso quando a persistencia do agendamento falha', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ id: 'tenant-1' }] })
      .mockResolvedValueOnce({ rows: [] });

    mockGetSession.mockResolvedValue({
      step: 'choose_time',
      data: {
        availableSlots: ['10:00'],
        selectedDate: '2026-04-20',
        professionalId: 'professional-1',
        clientId: 'client-1',
        serviceId: 'service-1',
        serviceName: 'Corte',
        professionalName: 'Joao',
        servicePrice: 55,
      },
    });

    mockAppointmentServiceCreate.mockRejectedValue(new Error('db write failed'));

    const result = await handleIncomingMessage('5511777777777', '1', {
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    expect(result).toEqual(expect.objectContaining({ ok: true, ignored: false }));
    expect(mockAppointmentServiceCreate).toHaveBeenCalledTimes(1);
    expect(mockDeleteSession).not.toHaveBeenCalled();
    expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(1);

    const [, sentMessage] = (mockSendWhatsAppMessage.mock.calls[0] as [string, string]);
    expect(sentMessage).toContain('Não consegui confirmar seu agendamento agora');
    expect(sentMessage).not.toContain('Agendamento confirmado');
  });

  it('informa encaixe quando nao houver slots e allowWalkins estiver ativado', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({ rows: [{ id: 'tenant-1' }] })
      .mockResolvedValueOnce({ rows: [{ time: '08:00:00' }, { time: '08:30:00' }] });

    mockGetSession.mockResolvedValue({
      step: 'choose_date',
      data: {
        professionalId: 'professional-1',
        serviceDuration: 30,
        availableDates: ['2026-04-20'],
      },
    });

    mockGetBusinessBusinessSettings.mockResolvedValue({
      openingTime: '08:00',
      closingTime: '18:00',
      slotIntervalMinutes: 30,
      allowWalkins: true,
      autoConfirmAppointments: true,
      timezone: 'America/Sao_Paulo',
    });

    mockGenerateAvailableTimeSlots.mockReturnValue([]);

    const result = await handleIncomingMessage('5511777777777', '1', {
      now: new Date('2026-04-18T10:00:00-03:00'),
    });

    expect(result).toEqual(expect.objectContaining({ ok: true, ignored: false }));

    const [, sentMessage] = (mockSendWhatsAppMessage.mock.calls[0] as [string, string]);
    expect(sentMessage).toContain('aceitamos encaixes durante o horário de atendimento');
  });

  it('avaliacao: sessao antiga em send_rating nao grava nota e volta ao menu', async () => {
    process.env.WHATSAPP_DEFAULT_BUSINESS_ID = 'tenant-1';
    mockGetWhatsAppStatus.mockReturnValue({ connectedNumber: null });
    mockIsWithinBusinessHours.mockReturnValue(true);
    mockIsSessionExpired.mockReturnValue(false);
    mockGetSession.mockResolvedValue({ step: 'send_rating', data: { appointmentId: 'apt-1' } });
    mockGetMenuOptions.mockResolvedValue([]);

    await handleIncomingMessage('5511777777777', '1', { now: new Date('2026-04-18T10:00:00-03:00') });

    expect(prisma.whatsappRating.upsert).not.toHaveBeenCalled();
    expect(mockDeleteSession).toHaveBeenCalledWith('5511777777777', 'tenant-1');
    expect(mockCreateSession).toHaveBeenCalledWith('5511777777777', 'tenant-1');
    expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(1);
  });
});
