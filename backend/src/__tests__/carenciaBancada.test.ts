import { vi, describe, it, expect, beforeEach } from 'vitest';
import express, { type Request, type Response } from 'express';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';

// Cadeia real: authMiddleware + requireProfissional + rotas da bancada. Só o banco é simulado.
const mockCtx = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));
vi.mock('../repositories/subscriptionRepository.js', () => ({
  subscriptionRepository: {
    getBusinessBillingContext: vi.fn(async () => (mockCtx.current ? { ...mockCtx.current } : null)),
  },
}));
vi.mock('../utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
}));
vi.mock('../config/prisma.js', () => ({ prisma: {} }));
vi.mock('../services/scheduleSettingsService.js', () => ({
  getBusinessScheduleSettings: vi.fn().mockResolvedValue({ timezone: 'America/Sao_Paulo' }),
}));

const repo = vi.hoisted(() => ({ usuarioProfissional: vi.fn() }));
vi.mock('../modules/bancada/bancada.repository.js', () => ({ bancadaRepository: repo }));

const servico = vi.hoisted(() => ({
  iniciar: vi.fn(), reagendar: vi.fn(), agendaDeHoje: vi.fn(), numeros: vi.fn(),
}));
vi.mock('../modules/bancada/bancada.service.js', () => ({
  bancadaService: new Proxy(servico, {
    get: (alvo, nome: string) => (alvo as Record<string, unknown>)[nome] ?? vi.fn().mockResolvedValue({ ok: true }),
  }),
}));

const comissoes = vi.hoisted(() => ({ apuracao: vi.fn() }));
vi.mock('../modules/reports/comissoes.service.js', () => ({ comissoesService: comissoes }));
vi.mock('../modules/reports/relatorios.service.js', () => ({ relatoriosService: {} }));
vi.mock('../modules/avaliacoes/avaliacoes.service.js', () => ({ avaliacoesService: {} }));

const { authMiddleware } = await import('../middleware/auth.js');
const bancadaRoutes = (await import('../modules/bancada/bancada.routes.js')).default;
const { numbers } = await import('../modules/bancada/bancada.controller.js');
const { getCommissions } = await import('../modules/reports/reports.controller.js');
const { requireProfissional } = await import('../modules/bancada/bancada.middleware.js');
const { statusEfetivoDaAssinatura } = await import('../modules/conta/statusEfetivo.js');
const { errorHandler } = await import('../middleware/errorHandler.js');

const DIA = 86_400_000;
const ID = '3f2b8c1e-9a4d-4e6b-8c2a-1d5e7f9a0b3c';
const base = {
  business_id: 'b1', payment_method: null, provider_subscription_id: null, provider_payment_id: null,
  stripe_subscription_id: null, last_payment_date: null, plan: 'premium', subscription_status: 'past_due', ja_pagou: true,
};
const carencia = () => ({ ...base, inadimplente_desde: new Date(Date.now() - 2 * DIA) });
const bloqueada = () => ({ ...base, inadimplente_desde: new Date(Date.now() - 10 * DIA) });

const token = jwt.sign(
  { userId: 'u9', businessId: 'b1', email: 'ana@x.com', plan: 'premium', role: 'professional' },
  process.env.JWT_SECRET ?? 'test-secret',
  { expiresIn: '15m' },
);

const app = express();
app.use(express.json());
app.use('/api/v1/bancada', bancadaRoutes);
app.use(errorHandler);
const request = supertest(app);
const auth = (t: supertest.Test) => t.set('Authorization', `Bearer ${token}`);

beforeEach(() => {
  vi.clearAllMocks();
  repo.usuarioProfissional.mockResolvedValue({
    blocked: false, businessId: 'b1', professional: { id: 'p1', name: 'Ana', active: true, businessId: 'b1' },
  });
  servico.iniciar.mockResolvedValue({ ok: true });
  servico.reagendar.mockResolvedValue({ ok: true });
  servico.numeros.mockResolvedValue({ ok: true });
  comissoes.apuracao.mockResolvedValue({ ok: true });
});

describe('bancada na carência (cadeia real de middlewares)', () => {
  beforeEach(() => { mockCtx.current = carencia(); });

  it('POST /agendamentos/:id/iniciar passa por auth e requireProfissional', async () => {
    const res = await auth(request.post(`/api/v1/bancada/agendamentos/${ID}/iniciar`));
    expect(res.status).toBe(200);
    expect(servico.iniciar).toHaveBeenCalledWith('b1', { id: 'p1', nome: 'Ana' }, ID);
  });

  it('GET /hoje passa', async () => {
    const res = await auth(request.get('/api/v1/bancada/hoje'));
    expect(res.status).toBe(200);
  });

  it('POST /agendamentos/:id/reagendar fora da lista dá 402 carencia', async () => {
    const res = await auth(request.post(`/api/v1/bancada/agendamentos/${ID}/reagendar`).send({ date: '2026-11-01', time: '10:00' }));
    expect(res.status).toBe(402);
    expect(res.body.error.details).toEqual({ estado: 'carencia' });
    expect(servico.reagendar).not.toHaveBeenCalled();
  });
});

describe('bancada bloqueada', () => {
  beforeEach(() => { mockCtx.current = bloqueada(); });

  it('GET /hoje dá 402 bloqueada', async () => {
    const res = await auth(request.get('/api/v1/bancada/hoje'));
    expect(res.status).toBe(402);
    expect(res.body.error.details).toEqual({ estado: 'bloqueada' });
  });

  it('requireProfissional com past_due sem carência continua barrando', async () => {
    const req = { user: { role: 'professional', plan: 'premium', subscriptionStatus: 'past_due', userId: 'u9', businessId: 'b1' }, estadoConta: { tipo: 'bloqueada', motivo: 'cobranca' } } as unknown as Request;
    const next = vi.fn();
    await requireProfissional(req, { locals: {} } as unknown as Response, next);
    expect(next.mock.calls[0]?.[0]?.code).toBe('FEATURE_BLOCKED');
  });
});

describe('statusEfetivoDaAssinatura', () => {
  const req = (estadoConta: unknown, subscriptionStatus = 'past_due') =>
    ({ user: { subscriptionStatus }, estadoConta }) as unknown as Request;

  it.each([
    [{ tipo: 'carencia' }, 'past_due', 'active'],
    [{ tipo: 'ativa' }, 'pending', 'active'],
    [{ tipo: 'bloqueada', motivo: 'cobranca' }, 'past_due', 'past_due'],
    [undefined, 'trialing', 'trialing'],
    [undefined, 'past_due', 'past_due'],
  ])('%o + %s -> %s', (estado, status, esperado) => {
    expect(statusEfetivoDaAssinatura(req(estado, status))).toBe(esperado);
  });
});

describe('ctx das comissões usa o status efetivo', () => {
  const reqCarencia = () => ({
    user: { userId: 'u9', businessId: 'b1', plan: 'premium', subscriptionStatus: 'past_due' },
    estadoConta: { tipo: 'carencia', desde: new Date(), ate: new Date(), diasRestantes: 5 },
    query: {},
  }) as unknown as Request;
  const res = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() }) as unknown as Response;

  it('reports getCommissions', async () => {
    const next = vi.fn();
    await getCommissions(reqCarencia(), res(), next);
    expect(next).not.toHaveBeenCalled();
    expect(comissoes.apuracao.mock.calls[0]?.[2]).toEqual({ plan: 'premium', subscriptionStatus: 'active' });
  });

  it('bancada numbers', async () => {
    const next = vi.fn();
    const r = res();
    (r as unknown as { locals: unknown }).locals = { profissional: { id: 'p1', nome: 'Ana' } };
    await numbers(reqCarencia(), r, next);
    expect(next).not.toHaveBeenCalled();
    expect(servico.numeros.mock.calls[0]?.[3]).toEqual({ plan: 'premium', subscriptionStatus: 'active' });
  });
});
