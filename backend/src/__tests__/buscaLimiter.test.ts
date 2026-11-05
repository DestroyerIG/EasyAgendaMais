import { vi, describe, it, expect } from 'vitest';
import express from 'express';

const busca = vi.hoisted(() => ({ buscar: vi.fn() }));

vi.mock('../config/prisma.js', () => ({ prisma: {} }));
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { user: unknown }).user = {
      userId: 'u1', businessId: req.header('x-biz') ?? 'b1', role: 'tenant_admin',
      plan: 'profissional', subscriptionStatus: 'active',
    };
    next();
  },
}));
vi.mock('../modules/busca/busca.service.js', () => ({ buscaService: busca }));

const router = (await import('../modules/busca/busca.routes.js')).default;
const { criarApiLimiterSkip } = await import('../middleware/apiLimiterSkip.js');
const supertest = (await import('supertest')).default;

busca.buscar.mockResolvedValue({ clientes: [], agendamentos: [] });

const app = express();
app.use(express.json());
app.use('/api/v1/busca', router);
app.get('/api/v1/outra', (_req, res) => { res.json({ ok: true }); });
const request = supertest(app);

describe('limitador da busca', () => {
  it('429 ao passar de 600 pedidos, só para aquele negócio e só na busca', async () => {
    for (let i = 0; i < 600; i++) {
      const r = await request.post('/api/v1/busca').set('x-biz', 'salao-a').send({ q: 'ana' });
      if (r.status !== 200) throw new Error(`pedido ${i + 1} deu ${r.status}`);
    }
    const estourou = await request.post('/api/v1/busca').set('x-biz', 'salao-a').send({ q: 'ana' });
    expect(estourou.status).toBe(429);
    expect(estourou.body.error.code).toBe('RATE_LIMIT');
    expect(estourou.headers['ratelimit-limit'] ?? estourou.headers['ratelimit']).toBeDefined();

    // Outro negócio tem contador próprio.
    expect((await request.post('/api/v1/busca').set('x-biz', 'salao-b').send({ q: 'ana' })).status).toBe(200);
    // Outras rotas não passam por esse limitador.
    expect((await request.get('/api/v1/outra')).status).toBe(200);
  }, 60000);
});

describe('criarApiLimiterSkip', () => {
  const skip = criarApiLimiterSkip('/api/v1', ['/api/v1/whatsapp/webhook']);
  it('pula só POST /busca exato, OPTIONS e webhooks', () => {
    expect(skip({ method: 'POST', originalUrl: '/api/v1/busca' })).toBe(true);
    expect(skip({ method: 'OPTIONS', originalUrl: '/api/v1/clients' })).toBe(true);
    expect(skip({ method: 'POST', originalUrl: '/api/v1/whatsapp/webhook' })).toBe(true);
  });
  it('não pula GET, query string nem outras rotas', () => {
    expect(skip({ method: 'GET', originalUrl: '/api/v1/busca' })).toBe(false);
    expect(skip({ method: 'POST', originalUrl: '/api/v1/busca?x=1' })).toBe(false);
    expect(skip({ method: 'POST', originalUrl: '/api/v1/busca/outra' })).toBe(false);
    expect(skip({ method: 'POST', originalUrl: '/api/v1/clients' })).toBe(false);
  });
});
