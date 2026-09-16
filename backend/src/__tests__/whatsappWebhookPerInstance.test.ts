import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest';

vi.mock('../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
}));

const mockQueryRaw = vi.hoisted(() => vi.fn());

vi.mock('../config/prisma.js', () => ({
  prisma: { $queryRaw: mockQueryRaw },
}));

const { evolutionApi, WEBHOOK_EVENTS } = await import('../modules/whatsapp/evolution-api.service.js');
const { whatsappService } = await import('../modules/whatsapp/whatsapp.service.js');

const EVOLUTION = 'http://evolution.local';
const BACKEND = 'https://easybarber-backend.onrender.com/api/v1/whatsapp/webhook';
const MINIMAL_EVENTS = ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'];

type FetchCall = [string, RequestInit | undefined];

const jsonResponse = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

/**
 * Routes mocked fetch calls by "METHOD path" so each test only declares the
 * Evolution endpoints it cares about. Unknown routes fail loudly.
 */
const routeFetch = (routes: Record<string, unknown>) => {
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const key = `${method} ${url.replace(EVOLUTION, '')}`;
    if (!(key in routes)) {
      throw new Error(`fetch nao mockado: ${key}`);
    }
    return jsonResponse(200, routes[key]);
  }) as unknown as typeof fetch;
};

const fetchCalls = (): FetchCall[] =>
  (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls as FetchCall[];

const webhookSetCalls = (): FetchCall[] =>
  fetchCalls().filter(([url]) => url.includes('/webhook/set/'));

describe('webhook por instancia — eventos minimos', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EVOLUTION_API_URL = EVOLUTION;
    process.env.EVOLUTION_API_KEY = 'test-key';
    process.env.BACKEND_WEBHOOK_BASE_URL = BACKEND;
    delete process.env.EVOLUTION_WEBHOOK_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  });

  it('assina apenas os eventos que o webhook.handler realmente processa', () => {
    expect([...WEBHOOK_EVENTS].sort()).toEqual([...MINIMAL_EVENTS].sort());
  });

  it('createInstance envia o objeto webhook da instancia com os eventos minimos', async () => {
    routeFetch({ 'POST /instance/create': { instance: { instanceName: 'loja_1' } } });

    await evolutionApi.createInstance('loja_1', BACKEND);

    const [url, init] = fetchCalls()[0]!;
    expect(url).toBe(`${EVOLUTION}/instance/create`);
    const body = JSON.parse(init!.body as string);
    expect(body.webhook).toMatchObject({ url: BACKEND, enabled: true, webhookByEvents: true });
    expect([...body.webhook.events].sort()).toEqual([...MINIMAL_EVENTS].sort());
  });

  it('setWebhook envia os eventos minimos para /webhook/set/{instancia}', async () => {
    routeFetch({ 'POST /webhook/set/loja_1': { ok: true } });

    await evolutionApi.setWebhook('loja_1', BACKEND);

    const [[url, init]] = webhookSetCalls() as [FetchCall];
    expect(url).toBe(`${EVOLUTION}/webhook/set/loja_1`);
    const body = JSON.parse(init!.body as string);
    expect(body.webhook).toMatchObject({ url: BACKEND, enabled: true });
    expect([...body.webhook.events].sort()).toEqual([...MINIMAL_EVENTS].sort());
  });
});

describe('whatsappService.syncAllWebhooks', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.EVOLUTION_API_URL = EVOLUTION;
    process.env.EVOLUTION_API_KEY = 'test-key';
    process.env.BACKEND_WEBHOOK_BASE_URL = BACKEND;
    delete process.env.EVOLUTION_WEBHOOK_URL;
    mockQueryRaw.mockResolvedValue([{ whatsapp_instance_name: 'loja_1' }]);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  });

  it('reaplica quando a instancia tem a URL certa mas assina eventos a mais (formato v2 camelCase)', async () => {
    routeFetch({
      'GET /instance/fetchInstances': [{ name: 'loja_1' }],
      'GET /webhook/find/loja_1': {
        enabled: true,
        url: BACKEND,
        webhookByEvents: true,
        webhookBase64: false,
        events: [...MINIMAL_EVENTS, 'MESSAGES_UPDATE', 'SEND_MESSAGE', 'CALL'],
      },
      'POST /webhook/set/loja_1': { ok: true },
    });

    const result = await whatsappService.syncAllWebhooks();

    expect(webhookSetCalls()).toHaveLength(1);
    expect(result.instances).toEqual([{ name: 'loja_1', ok: true, reapplied: true }]);
  });

  it('nao reaplica quando a instancia ja corresponde (formato v2 camelCase)', async () => {
    routeFetch({
      'GET /instance/fetchInstances': [{ name: 'loja_1' }],
      'GET /webhook/find/loja_1': {
        enabled: true,
        url: BACKEND,
        webhookByEvents: true,
        webhookBase64: false,
        events: [...MINIMAL_EVENTS].reverse(),
      },
    });

    const result = await whatsappService.syncAllWebhooks();

    expect(webhookSetCalls()).toHaveLength(0);
    expect(result.instances).toEqual([{ name: 'loja_1', ok: true, reapplied: false }]);
  });

  it('nao reaplica quando a instancia ja corresponde (formato v1 snake_case aninhado)', async () => {
    routeFetch({
      'GET /instance/fetchInstances': [{ instance: { instanceName: 'loja_1' } }],
      'GET /webhook/find/loja_1': {
        webhook: {
          enabled: true,
          url: BACKEND,
          webhook_by_events: true,
          webhook_base64: false,
          events: MINIMAL_EVENTS,
        },
      },
    });

    const result = await whatsappService.syncAllWebhooks();

    expect(webhookSetCalls()).toHaveLength(0);
    expect(result.instances).toEqual([{ name: 'loja_1', ok: true, reapplied: false }]);
  });

  it('reaplica quando a instancia nao tem webhook proprio (so dependia do global)', async () => {
    routeFetch({
      'GET /instance/fetchInstances': [{ name: 'loja_1' }],
      'GET /webhook/find/loja_1': null,
      'POST /webhook/set/loja_1': { ok: true },
    });

    const result = await whatsappService.syncAllWebhooks();

    expect(webhookSetCalls()).toHaveLength(1);
    expect(result.instances).toEqual([{ name: 'loja_1', ok: true, reapplied: true }]);
  });

  it('nao toca em instancias que nao estao no banco (ex.: instancias do outro sistema)', async () => {
    routeFetch({
      'GET /instance/fetchInstances': [{ name: 'loja_1' }, { name: 'easypay_main' }],
      'GET /webhook/find/loja_1': null,
      'POST /webhook/set/loja_1': { ok: true },
    });

    const result = await whatsappService.syncAllWebhooks();

    expect(fetchCalls().some(([url]) => url.includes('easypay_main'))).toBe(false);
    expect(result.skippedOrphans).toEqual(['easypay_main']);
  });

  it('usa EVOLUTION_WEBHOOK_URL quando BACKEND_WEBHOOK_BASE_URL esta vazia', async () => {
    process.env.BACKEND_WEBHOOK_BASE_URL = '';
    process.env.EVOLUTION_WEBHOOK_URL = BACKEND;
    routeFetch({
      'GET /instance/fetchInstances': [{ name: 'loja_1' }],
      'GET /webhook/find/loja_1': null,
      'POST /webhook/set/loja_1': { ok: true },
    });

    await whatsappService.syncAllWebhooks();

    const [[, init]] = webhookSetCalls() as [FetchCall];
    expect(JSON.parse(init!.body as string).webhook.url).toBe(BACKEND);
  });
});
