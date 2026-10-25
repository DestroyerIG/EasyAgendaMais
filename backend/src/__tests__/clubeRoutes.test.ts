import { vi, describe, it, beforeEach, expect } from 'vitest';
import express from 'express';

const clube = vi.hoisted(() => ({
  listarOfertas: vi.fn(), criarOferta: vi.fn(), editarOferta: vi.fn(), listarContratos: vi.fn(), vincular: vi.fn(),
  cancelar: vi.fn(), confirmarCobranca: vi.fn(), reenviarCobranca: vi.fn(), exportarCsv: vi.fn(), contratosDoCliente: vi.fn(),
}));
const publico = vi.hoisted(() => ({ vitrine: vi.fn(), oferta: vi.fn(), aderir: vi.fn() }));

vi.mock('../config/prisma.js', () => ({ prisma: {} }));
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { user: unknown }).user = {
      userId: 'u1', businessId: 'b1', role: req.header('x-role') ?? 'tenant_admin',
      plan: req.header('x-plan') ?? 'premium', subscriptionStatus: 'active',
    };
    next();
  },
}));
vi.mock('../modules/clube/clube.service.js', () => ({ clubeService: clube }));
vi.mock('../modules/clube/clube.public.service.js', () => ({ clubePublicService: publico }));

const router = (await import('../modules/clube/clube.routes.js')).default;
const { errorHandler } = await import('../middleware/errorHandler.js');
const supertest = (await import('supertest')).default;

const app = express();
app.use(express.json());
app.use('/api/v1/clube', router);
app.use(errorHandler);
const request = supertest(app);

const ID = '11111111-1111-4111-8111-111111111111';
const ofertaValida = { tipo: 'pacote', nome: 'Pacote Fibra 10 sessões', preco: 850, servicos: [ID], totalSessoes: 10, validadeDias: 90 };

beforeEach(() => vi.clearAllMocks());

describe('rotas do clube', () => {
  it('fora do plano Salão: 403 e nada é chamado', async () => {
    const r = await request.get('/api/v1/clube/ofertas').set('x-plan', 'profissional');
    expect(r.status).toBe(403);
    expect(clube.listarOfertas).not.toHaveBeenCalled();
  });

  it('a funcionária lista, vincula e confirma, mas não cria plano nem cancela', async () => {
    clube.listarOfertas.mockResolvedValue([]);
    clube.confirmarCobranca.mockResolvedValue({});
    expect((await request.get('/api/v1/clube/ofertas').set('x-role', 'employee')).status).toBe(200);
    expect((await request.post(`/api/v1/clube/cobrancas/${ID}/confirmar`).set('x-role', 'employee').send({ forma: 'pix' })).status).toBe(200);
    expect((await request.post('/api/v1/clube/ofertas').set('x-role', 'employee').send(ofertaValida)).status).toBe(403);
    expect((await request.post(`/api/v1/clube/contratos/${ID}/cancelar`).set('x-role', 'employee')).status).toBe(403);
    expect(clube.criarOferta).not.toHaveBeenCalled();
    expect(clube.cancelar).not.toHaveBeenCalled();
  });

  it('valida a oferta: pacote precisa de sessões e validade, e não é público', async () => {
    clube.criarOferta.mockResolvedValue({ id: 'of1' });
    expect((await request.post('/api/v1/clube/ofertas').send({ ...ofertaValida, totalSessoes: undefined })).status).toBe(400);
    expect((await request.post('/api/v1/clube/ofertas').send({ ...ofertaValida, publica: true })).status).toBe(400);
    expect((await request.post('/api/v1/clube/ofertas').send({ ...ofertaValida, servicos: [] })).status).toBe(400);
    const r = await request.post('/api/v1/clube/ofertas').send(ofertaValida);
    expect(r.status).toBe(201);
    expect(clube.criarOferta).toHaveBeenCalledWith('b1', expect.objectContaining({ tipo: 'pacote', profissionais: [], descontoExtrasPct: 0 }));
  });

  it('pausar só com o status', async () => {
    clube.editarOferta.mockResolvedValue({ id: ID, status: 'pausada' });
    const r = await request.put(`/api/v1/clube/ofertas/${ID}`).send({ status: 'pausada' });
    expect(r.status).toBe(200);
    expect(clube.editarOferta).toHaveBeenCalledWith('b1', ID, { status: 'pausada' });
  });

  it('vincular exige forma válida e ids', async () => {
    clube.vincular.mockResolvedValue({ id: 'ct1' });
    expect((await request.post('/api/v1/clube/contratos').send({ ofertaId: ID, clientId: ID, pagamento: { forma: 'cheque', pago: true } })).status).toBe(400);
    const r = await request.post('/api/v1/clube/contratos').send({ ofertaId: ID, clientId: ID, pagamento: { forma: 'pix', pago: false } });
    expect(r.status).toBe(201);
    expect(clube.vincular).toHaveBeenCalledWith('b1', 'u1', { ofertaId: ID, clientId: ID, pagamento: { forma: 'pix', pago: false } });
  });

  it('lista com filtros e página', async () => {
    clube.listarContratos.mockResolvedValue({ itens: [] });
    await request.get('/api/v1/clube/contratos?tipo=clube&status=em_atraso&pagina=2');
    expect(clube.listarContratos).toHaveBeenCalledWith('b1', { tipo: 'clube', status: 'em_atraso', pagina: 2 });
  });

  it('CSV com cabeçalho de anexo', async () => {
    clube.exportarCsv.mockResolvedValue('﻿Cliente\r\n');
    const r = await request.get('/api/v1/clube/contratos/export.csv');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('text/csv');
    expect(r.headers['content-disposition']).toMatch(/attachment; filename="assinantes-/);
  });

  it('contratos da cliente ficam visíveis mesmo fora do plano Salão', async () => {
    clube.contratosDoCliente.mockResolvedValue([]);
    expect((await request.get(`/api/v1/clube/clientes/${ID}`).set('x-plan', 'basico')).status).toBe(200);
  });
});
