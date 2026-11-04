import { vi, describe, it, expect, beforeEach } from 'vitest';
import express, { type Request, type Response } from 'express';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';

const mockCtx = vi.hoisted(() => ({ current: null as Record<string, unknown> | null, falha: false }));

vi.mock('../repositories/subscriptionRepository.js', () => ({
  subscriptionRepository: {
    getBusinessBillingContext: vi.fn(async () => {
      if (mockCtx.falha) throw new Error('db fora');
      return mockCtx.current ? { ...mockCtx.current } : null;
    }),
  },
}));

vi.mock('../utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
}));

import { escritaLiberadaNaCarencia } from '../modules/conta/carencia.rules.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireFeature } from '../middleware/subscriptionGuard.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { SubscriptionRequiredError } from '../utils/errors.js';

const DIA = 86_400_000;
const ID = '3f2b8c1e-9a4d-4e6b-8c2a-1d5e7f9a0b3c';

const base = {
  business_id: 'business-uuid',
  payment_method: null,
  provider_subscription_id: null,
  provider_payment_id: null,
  stripe_subscription_id: null,
  last_payment_date: null,
  plan: 'premium',
};

const ctxCarencia = () => ({
  ...base,
  subscription_status: 'past_due',
  ja_pagou: true,
  inadimplente_desde: new Date(Date.now() - 2 * DIA),
});

const ctxBloqueada = () => ({
  ...base,
  subscription_status: 'past_due',
  ja_pagou: true,
  inadimplente_desde: new Date(Date.now() - 10 * DIA),
});

const ctxAtiva = () => ({ ...base, subscription_status: 'active', ja_pagou: true, inadimplente_desde: null });

const token = (extra: Record<string, unknown> = {}) =>
  jwt.sign(
    { userId: 'user-uuid', businessId: 'business-uuid', email: 'a@b.com', plan: 'premium', role: 'tenant_admin', ...extra },
    process.env.JWT_SECRET ?? 'test-secret',
    { expiresIn: '15m' },
  );

const app = express();
app.use(express.json());
app.all(/.*/, authMiddleware, (req: Request, res: Response) => {
  res.json({ ok: true, estadoConta: req.estadoConta ?? null, status: req.user?.subscriptionStatus });
});
app.use(errorHandler);
const request = supertest(app);

const call = (method: string, path: string, tk = token()) =>
  (request as unknown as Record<string, (p: string) => supertest.Test>)[method.toLowerCase()]!(path).set(
    'Authorization',
    `Bearer ${tk}`,
  );

describe('escritaLiberadaNaCarencia', () => {
  it.each([
    ['PUT', `/api/v1/appointments/${ID}/status`],
    ['POST', `/api/v1/appointments/${ID}/comanda`],
    ['PUT', `/api/v1/comandas/${ID}`],
    ['POST', `/api/v1/comandas/${ID}/close`],
    ['POST', `/api/v1/comandas/${ID}/receipt`],
    ['POST', '/api/v1/cash/open'],
    ['POST', '/api/v1/cash/movements'],
    ['POST', '/api/v1/cash/close'],
    ['POST', `/api/v1/whatsapp/conversations/${ID}/messages`],
    ['POST', '/api/v1/whatsapp/conversations/lidas'],
    ['POST', `/api/v1/whatsapp/conversations/${ID}/assumir`],
    ['POST', `/api/v1/whatsapp/conversations/${ID}/devolver`],
    ['POST', `/api/v1/bancada/agendamentos/${ID}/iniciar`],
    ['PUT', `/api/v1/bancada/comandas/${ID}`],
    ['POST', `/api/v1/bancada/comandas/${ID}/enviar`],
    ['POST', `/api/v1/bancada/comandas/${ID}/fechar`],
    ['PATCH', `/api/v1/notifications/${ID}/read`],
    ['POST', '/api/v1/notifications/read-all'],
    // Rotas reais de notificação usam PUT.
    ['PUT', `/api/v1/notifications/${ID}/read`],
    ['PUT', '/api/v1/notifications/read-all'],
    // Maiúsculas no UUID e método em minúsculas.
    ['put', `/api/v1/comandas/${ID.toUpperCase()}`],
  ])('%s %s -> true', (method, path) => {
    expect(escritaLiberadaNaCarencia(method, path)).toBe(true);
  });

  it.each([
    ['POST', '/api/v1/appointments'],
    ['PUT', `/api/v1/appointments/${ID}`],
    ['DELETE', `/api/v1/appointments/${ID}`],
    ['POST', '/api/v1/clients'],
    ['POST', '/api/v1/whatsapp/campanhas'],
    ['POST', '/api/v1/cash/reopen'],
    ['POST', `/api/v1/bancada/agendamentos/${ID}/reagendar`],
    ['PUT', '/api/v1/comandas/settings'],
    // Método errado ou caminho só parecido.
    ['DELETE', `/api/v1/comandas/${ID}`],
    ['PUT', `/api/v1/appointments/${ID}/status/extra`],
    ['POST', `/api/v1/appointments/nao-uuid/comanda`],
    ['DELETE', `/api/v1/notifications/${ID}`],
    ['POST', '/api/v1/cash/open/../reopen'],
  ])('%s %s -> false', (method, path) => {
    expect(escritaLiberadaNaCarencia(method, path)).toBe(false);
  });
});

describe('authMiddleware em carência', () => {
  beforeEach(() => {
    mockCtx.current = ctxCarencia();
    mockCtx.falha = false;
  });

  it('GET /api/v1/clients passa e preenche req.estadoConta', async () => {
    const res = await call('GET', '/api/v1/clients?page=1');
    expect(res.status).toBe(200);
    expect(res.body.estadoConta.tipo).toBe('carencia');
    expect(res.body.status).toBe('past_due');
  });

  it('POST /api/v1/clients dá 402 com details.estado carencia e a mensagem', async () => {
    const res = await call('POST', '/api/v1/clients');
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('SUBSCRIPTION_REQUIRED');
    expect(res.body.error.details).toEqual({ estado: 'carencia' });
    expect(res.body.error.message).toBe('Disponível depois de regularizar a assinatura.');
    expect(res.body.message).toBe('Disponível depois de regularizar a assinatura.');
  });

  it('escrita liberada passa (fechar comanda)', async () => {
    const res = await call('POST', `/api/v1/comandas/${ID}/close?x=1`);
    expect(res.status).toBe(200);
    expect(res.body.estadoConta.tipo).toBe('carencia');
  });

  it.each(['PUT', 'DELETE', 'PATCH'])('%s fora da lista dá 402', async (method) => {
    const res = await call(method, `/api/v1/appointments/${ID}`);
    expect(res.status).toBe(402);
    expect(res.body.error.details).toEqual({ estado: 'carencia' });
  });
});

describe('authMiddleware bloqueada', () => {
  beforeEach(() => {
    mockCtx.current = ctxBloqueada();
    mockCtx.falha = false;
  });

  it('GET /api/v1/clients dá 402 com details.estado bloqueada e a mensagem de sempre', async () => {
    const res = await call('GET', '/api/v1/clients');
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('SUBSCRIPTION_REQUIRED');
    expect(res.body.error.details).toEqual({ estado: 'bloqueada' });
    expect(res.body.message).toBe('Finalize o pagamento para acessar o sistema.');
    expect(res.body.error.subscriptionStatus).toBe('past_due');
  });

  it('escrita da lista também dá 402 quando bloqueada', async () => {
    const res = await call('POST', `/api/v1/comandas/${ID}/close`);
    expect(res.status).toBe(402);
    expect(res.body.error.details).toEqual({ estado: 'bloqueada' });
  });

  it('sem contexto do negócio dá 402 bloqueada', async () => {
    mockCtx.current = null;
    const res = await call('GET', '/api/v1/clients');
    expect(res.status).toBe(402);
    expect(res.body.error.details).toEqual({ estado: 'bloqueada' });
  });
});

describe('rotas isentas passam em qualquer estado', () => {
  const isentas: Array<[string, string]> = [
    ['GET', '/api/v1/conta/estado'],
    ['GET', '/api/v1/conta/backup'],
    ['GET', '/api/v1/billing/invoices'],
    ['GET', '/api/v1/billing/payment-method'],
    ['POST', '/api/v1/billing/reactivate'],
    ['GET', '/api/v1/auth/me'],
  ];

  it.each(isentas)('bloqueada: %s %s passa com estadoConta', async (method, path) => {
    mockCtx.current = ctxBloqueada();
    mockCtx.falha = false;
    const res = await call(method, path);
    expect(res.status).toBe(200);
    expect(res.body.estadoConta).toEqual({ tipo: 'bloqueada', motivo: 'cobranca' });
  });

  it.each(isentas)('carência: %s %s passa com estadoConta', async (method, path) => {
    mockCtx.current = ctxCarencia();
    mockCtx.falha = false;
    const res = await call(method, path);
    expect(res.status).toBe(200);
    expect(res.body.estadoConta.tipo).toBe('carencia');
  });

  it.each([
    ['POST', '/api/v1/conta/backup'],
    ['POST', '/api/v1/conta/estado'],
    ['DELETE', '/api/v1/conta/backup'],
    ['GET', '/api/v1/conta/outra-coisa'],
    ['GET', '/api/v1/conta/backup/extra'],
  ])('bloqueada: %s %s não é isenta e dá 402', async (method, path) => {
    mockCtx.current = ctxBloqueada();
    mockCtx.falha = false;
    const res = await call(method, path);
    expect(res.status).toBe(402);
    expect(res.body.error.details).toEqual({ estado: 'bloqueada' });
  });

  it('bloqueada: HEAD /api/v1/conta/backup é isenta', async () => {
    mockCtx.current = ctxBloqueada();
    mockCtx.falha = false;
    const res = await request.head('/api/v1/conta/backup').set('Authorization', `Bearer ${token()}`);
    expect(res.status).toBe(200);
  });

  it('falha ao ler o contexto não derruba rota isenta', async () => {
    mockCtx.falha = true;
    const res = await call('GET', '/api/v1/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.estadoConta).toBeNull();
  });
});

describe('sem regressão', () => {
  beforeEach(() => {
    mockCtx.falha = false;
  });

  it('negócio ativo escreve normalmente e recebe estadoConta ativa', async () => {
    mockCtx.current = ctxAtiva();
    const res = await call('POST', '/api/v1/clients');
    expect(res.status).toBe(200);
    expect(res.body.estadoConta).toEqual({ tipo: 'ativa' });
  });

  it('trialing escreve normalmente', async () => {
    mockCtx.current = { ...base, subscription_status: 'trialing', ja_pagou: false, inadimplente_desde: null };
    const res = await call('DELETE', `/api/v1/appointments/${ID}`);
    expect(res.status).toBe(200);
  });

  it('teste vencido (incomplete, nunca pagou) continua 402 bloqueada', async () => {
    mockCtx.current = { ...base, subscription_status: 'incomplete', ja_pagou: false, inadimplente_desde: null };
    const res = await call('GET', '/api/v1/clients');
    expect(res.status).toBe(402);
    expect(res.body.error.details).toEqual({ estado: 'bloqueada' });
  });

  it('pending com período pago no futuro (Pix antecipado) continua ativa e escreve', async () => {
    mockCtx.current = {
      ...base,
      subscription_status: 'pending',
      ja_pagou: true,
      inadimplente_desde: new Date(),
      current_period_end: new Date(Date.now() + 5 * DIA),
    };
    const res = await call('POST', '/api/v1/clients');
    expect(res.status).toBe(200);
    expect(res.body.estadoConta).toEqual({ tipo: 'ativa' });
  });

  it('platform_admin não é afetado', async () => {
    mockCtx.current = ctxBloqueada();
    const res = await call('POST', '/api/v1/clients', token({ role: 'platform_admin', businessId: null }));
    expect(res.status).toBe(200);
    expect(res.body.estadoConta).toBeNull();
  });
});

describe('requireFeature na carência', () => {
  const rodar = (estadoConta: unknown, status = 'past_due') => {
    const req = {
      user: { plan: 'premium', subscriptionStatus: status, businessId: 'b' },
      estadoConta,
    } as unknown as Request;
    const next = vi.fn();
    requireFeature('clients')(req, {} as Response, next);
    return next.mock.calls[0]?.[0];
  };

  it('past_due em carência passa', () => {
    expect(rodar({ tipo: 'carencia', desde: new Date(), ate: new Date(), diasRestantes: 5 })).toBeUndefined();
  });

  it('past_due bloqueada barra como hoje', () => {
    const err = rodar({ tipo: 'bloqueada', motivo: 'cobranca' });
    expect(err).toBeDefined();
    expect(err.code).toBe('FEATURE_BLOCKED');
  });

  it('pending com estado ativa (Pix antecipado) passa', () => {
    expect(rodar({ tipo: 'ativa' }, 'pending')).toBeUndefined();
  });

  it('past_due sem estadoConta barra como hoje', () => {
    expect(rodar(undefined)).toBeDefined();
  });

  it('carência não libera feature acima do plano', () => {
    const req = {
      user: { plan: 'basico', subscriptionStatus: 'past_due', businessId: 'b' },
      estadoConta: { tipo: 'carencia', desde: new Date(), ate: new Date(), diasRestantes: 5 },
    } as unknown as Request;
    const next = vi.fn();
    requireFeature('reports')(req, {} as Response, next);
    expect(next.mock.calls[0]?.[0]?.reason).toBe('plan_upgrade_required');
  });
});

describe('SubscriptionRequiredError', () => {
  it('sem estado mantém o formato antigo', () => {
    const e = new SubscriptionRequiredError({ reason: 'x' });
    expect(e.message).toBe('Finalize o pagamento para acessar o sistema.');
    expect(e.details).toBeUndefined();
  });

  it('com estado e mensagem', () => {
    const e = new SubscriptionRequiredError({ estado: 'carencia', message: 'Oi.' });
    expect(e.message).toBe('Oi.');
    expect(e.details).toEqual({ estado: 'carencia' });
    expect(e.statusCode).toBe(402);
  });
});
