import { vi, describe, it, beforeEach, expect } from 'vitest';
import express from 'express';

const busca = vi.hoisted(() => ({ buscar: vi.fn() }));

vi.mock('../config/prisma.js', () => ({ prisma: {} }));
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.header('x-anon')) { res.status(401).json({ success: false }); return; }
    (req as unknown as { user: unknown }).user = {
      userId: 'u1', businessId: 'b1', role: req.header('x-role') ?? 'tenant_admin',
      plan: 'profissional', subscriptionStatus: 'active',
    };
    next();
  },
}));
vi.mock('../modules/busca/busca.service.js', () => ({ buscaService: busca }));

const router = (await import('../modules/busca/busca.routes.js')).default;
const { errorHandler } = await import('../middleware/errorHandler.js');
const supertest = (await import('supertest')).default;

const app = express();
app.use(express.json());
app.use('/api/v1/busca', router);
app.use(errorHandler);
const request = supertest(app);

const VAZIO = { clientes: [], agendamentos: [] };

beforeEach(() => {
  vi.clearAllMocks();
  busca.buscar.mockResolvedValue(VAZIO);
});

describe('POST /api/v1/busca', () => {
  it('devolve o resultado do service e usa o businessId do login', async () => {
    const r = await request.post('/api/v1/busca').send({ q: 'ana' });
    expect(r.body.data).toEqual(VAZIO);
    expect(busca.buscar).toHaveBeenCalledWith('b1', 'ana');
  });

  it('responde com Cache-Control: no-store', async () => {
    const r = await request.post('/api/v1/busca').send({ q: 'ana' });
    expect(r.headers['cache-control']).toBe('no-store');
  });

  it('tira os espaços do termo', async () => {
    await request.post('/api/v1/busca').send({ q: '  ana  ' });
    expect(busca.buscar).toHaveBeenCalledWith('b1', 'ana');
  });

  it('responde 200, não 201', async () => {
    expect((await request.post('/api/v1/busca').send({ q: 'ana' })).status).toBe(200);
  });

  it('400 com termo curto', async () => {
    expect((await request.post('/api/v1/busca').send({ q: 'a' })).status).toBe(400);
    expect(busca.buscar).not.toHaveBeenCalled();
  });

  it('400 sem q no corpo', async () => {
    expect((await request.post('/api/v1/busca').send({})).status).toBe(400);
  });

  it('400 com termo acima de 80 caracteres', async () => {
    expect((await request.post('/api/v1/busca').send({ q: 'a'.repeat(81) })).status).toBe(400);
  });

  it('401 sem login', async () => {
    expect((await request.post('/api/v1/busca').set('x-anon', '1').send({ q: 'ana' })).status).toBe(401);
    expect(busca.buscar).not.toHaveBeenCalled();
  });

  it('403 para o papel professional', async () => {
    expect((await request.post('/api/v1/busca').set('x-role', 'professional').send({ q: 'ana' })).status).toBe(403);
    expect(busca.buscar).not.toHaveBeenCalled();
  });
});
