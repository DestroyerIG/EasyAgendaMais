import { vi, describe, it, beforeEach, expect } from 'vitest';
import express from 'express';

const service = vi.hoisted(() => ({ listar: vi.fn(), detalhes: vi.fn(), salvar: vi.fn(), cancelar: vi.fn() }));
const publico = vi.hoisted(() => ({ previa: vi.fn(), montar: vi.fn() }));
const repo = vi.hoisted(() => ({ opcoes: vi.fn() }));

vi.mock('../config/prisma.js', () => ({ prisma: {} }));
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { user: unknown }).user = { userId: 'u1', businessId: 'b1', role: 'tenant_admin' };
    next();
  },
}));
vi.mock('../middleware/rbac.js', () => ({
  requireTenantRoles: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));
vi.mock('../middleware/subscriptionGuard.js', () => ({
  requireFeature: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));
vi.mock('../modules/whatsappCampanhas/campanhas.service.js', () => ({ campanhasService: service }));
vi.mock('../modules/whatsappCampanhas/publico.service.js', () => ({ publicoService: publico }));
vi.mock('../modules/whatsappCampanhas/campanhas.repository.js', () => ({ campanhasRepository: repo }));

const router = (await import('../modules/whatsappCampanhas/campanhas.routes.js')).default;
const { errorHandler } = await import('../middleware/errorHandler.js');
const supertest = (await import('supertest')).default;

const app = express();
app.use(express.json());
app.use('/api/v1/whatsapp/campanhas', router);
app.use(errorHandler);
const request = supertest(app);

const ID = '11111111-1111-4111-8111-111111111111';
const CORPO = {
  segmento: 'em_risco', nome: 'Volta', texto: 'Oi!', data: '2026-10-22', hora: '10:00', acao: 'agendar',
};

beforeEach(() => vi.clearAllMocks());

describe('rotas de campanhas', () => {
  it('POST /publico sem segmento → 400', async () => {
    const r = await request.post('/api/v1/whatsapp/campanhas/publico').send({ texto: 'Oi' });
    expect(r.status).toBe(400);
    expect(publico.previa).not.toHaveBeenCalled();
  });

  it('POST /publico válido devolve a prévia', async () => {
    publico.previa.mockResolvedValue({ selecionadas: 1, receberao: 1, resguardadas: 0, amostra: null });
    const r = await request.post('/api/v1/whatsapp/campanhas/publico').send({ segmento: 'todas' });
    expect(r.status).toBe(200);
    expect(r.body.data.receberao).toBe(1);
    expect(publico.previa).toHaveBeenCalledWith('b1', expect.objectContaining({ segmento: 'todas', professionalId: null }));
  });

  it('POST / com hora 10:15 → 400', async () => {
    const r = await request.post('/api/v1/whatsapp/campanhas').send({ ...CORPO, hora: '10:15' });
    expect(r.status).toBe(400);
    expect(service.salvar).not.toHaveBeenCalled();
  });

  it('POST / válido → 201 com campanha e jaNaFila', async () => {
    service.salvar.mockResolvedValue({ campanha: { id: ID }, jaNaFila: 0 });
    const r = await request.post('/api/v1/whatsapp/campanhas').send(CORPO);
    expect(r.status).toBe(201);
    expect(r.body.data).toEqual({ campanha: { id: ID }, jaNaFila: 0 });
    expect(service.salvar).toHaveBeenCalledWith('b1', 'u1', expect.objectContaining({ cadencia: 25 }));
  });

  it('GET /opcoes não cai em /:id', async () => {
    repo.opcoes.mockResolvedValue({ profissionais: [], servicos: [] });
    const r = await request.get('/api/v1/whatsapp/campanhas/opcoes');
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ profissionais: [], servicos: [] });
    expect(service.detalhes).not.toHaveBeenCalled();
  });

  it('GET /:id com id inválido → 400', async () => {
    const r = await request.get('/api/v1/whatsapp/campanhas/nao-e-uuid');
    expect(r.status).toBe(400);
    expect(service.detalhes).not.toHaveBeenCalled();
  });

  it('PUT /:id e POST /:id/cancelar repassam o id', async () => {
    service.salvar.mockResolvedValue({ campanha: { id: ID }, jaNaFila: 0 });
    service.cancelar.mockResolvedValue({ id: ID, status: 'cancelada' });
    expect((await request.put(`/api/v1/whatsapp/campanhas/${ID}`).send({ ...CORPO, acao: 'rascunho' })).status).toBe(200);
    expect(service.salvar).toHaveBeenCalledWith('b1', 'u1', expect.any(Object), ID);
    expect((await request.post(`/api/v1/whatsapp/campanhas/${ID}/cancelar`)).status).toBe(200);
    expect(service.cancelar).toHaveBeenCalledWith('b1', ID);
  });
});
