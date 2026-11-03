import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest';
import express from 'express';
import type { LinhaNegocio } from '../modules/admin/painel.rules.js';

const repo = vi.hoisted(() => ({
  linhasNegocios: vi.fn(),
  linhaNegocio: vi.fn(),
  disparos24h: vi.fn(),
  extrasNegocio: vi.fn(),
  ltv: vi.fn(),
  uso: vi.fn(),
  auditoria: vi.fn(),
}));
const billing = vi.hoisted(() => ({ faturas: vi.fn() }));

vi.mock('../config/prisma.js', () => ({ prisma: {} }));
vi.mock('../modules/admin/painel.repository.js', () => ({ painelRepository: repo }));
vi.mock('../modules/billing/billingInfo.service.js', () => ({ billingInfoService: billing }));
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { user: unknown }).user = { userId: 'u1', businessId: null, role: 'platform_admin' };
    next();
  },
}));

const router = (await import('../routes/admin.js')).default;
const { errorHandler } = await import('../middleware/errorHandler.js');
const supertest = (await import('supertest')).default;

const app = express();
app.use(express.json());
app.use('/api/v1/admin', router);
app.use(errorHandler);
const request = supertest(app);

const ID = '11111111-1111-4111-8111-111111111111';
const MS_DIA = 86_400_000;

function linha(parcial: Partial<LinhaNegocio> = {}): LinhaNegocio {
  return {
    id: ID, nome: 'Studio Ana', dono: 'Ana', email: 'ana@x.com', whatsapp: '11999999999',
    cpfCnpj: '12345678900', endereco: null, segmento: 'unhas',
    plano: 'profissional', statusAssinatura: 'active', ativo: true,
    inadimplenteDesde: null, jaPagou: true, fimDoPeriodo: new Date(Date.now() + 10 * MS_DIA), pix: false,
    criadoEm: new Date('2026-01-10T12:00:00Z'), canceladoEm: null, onboardingConcluido: true,
    temInstanciaWhatsapp: true, whatsappConectadoEm: null, ultimoEnvioEm: null,
    agendamentos30d: 4, ultimoAgendamentoEm: null,
    primeiroPagamentoEm: null, pagouMesAnterior: true,
    ...parcial,
  };
}

const usoBase = {
  profissionaisAtivas: 2, agendamentosMes: 12, agendamentosComSinalMes: 3,
  clientes: 40, clientesNovosMes: 5, lembretesLigados: true, enviosMes: { enviados: 30, falhos: 2 },
};

const urlOriginal = process.env.FRONTEND_URL;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.FRONTEND_URL;
  repo.linhaNegocio.mockResolvedValue(linha());
  repo.extrasNegocio.mockResolvedValue({
    slug: 'ana', suspensoMotivo: null, temAssinaturaGateway: false, usuarioDonoId: 'dono1', proximoVencimento: null,
  });
  repo.ltv.mockResolvedValue({ total: 0, ciclos: 0, desde: null });
  repo.uso.mockResolvedValue(usoBase);
  billing.faturas.mockResolvedValue({ anos: [2026], itens: [{ id: 'f1' }] });
  repo.auditoria.mockResolvedValue({ data: [], total: 0 });
});

afterEach(() => {
  if (urlOriginal === undefined) delete process.env.FRONTEND_URL;
  else process.env.FRONTEND_URL = urlOriginal;
});

describe('GET /admin/tenants/:id', () => {
  it('id inexistente responde 404', async () => {
    repo.linhaNegocio.mockResolvedValue(null);
    repo.extrasNegocio.mockResolvedValue(null);
    const res = await request.get(`/api/v1/admin/tenants/${ID}`);
    expect(res.status).toBe(404);
  });

  it('devolve o negócio com os campos do detalhe e as faturas', async () => {
    const res = await request.get(`/api/v1/admin/tenants/${ID}`);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.negocio).toMatchObject({
      id: ID, nome: 'Studio Ana', status: 'ativo', cpfCnpj: '12345678900', slug: 'ana',
      statusAssinatura: 'active', jaPagou: true, usuarioDonoId: 'dono1', temAssinaturaGateway: false,
      criadoEm: '2026-01-10T12:00:00.000Z',
    });
    expect(d.faturas).toEqual([{ id: 'f1' }]);
    expect(d.proximaCobranca.valor).toBeGreaterThan(0);
    expect(billing.faturas).toHaveBeenCalledWith(ID, null);
  });

  it('faturas que falham não derrubam o detalhe: vem faturas null', async () => {
    billing.faturas.mockRejectedValue(new Error('Conta não encontrada'));
    const res = await request.get(`/api/v1/admin/tenants/${ID}`);
    expect(res.status).toBe(200);
    expect(res.body.data.faturas).toBeNull();
  });

  it('LTV com 3 pagamentos de 99 soma 297 em 3 ciclos', async () => {
    repo.ltv.mockResolvedValue({ total: 297, ciclos: 3, desde: new Date('2026-07-01T12:00:00Z') });
    const res = await request.get(`/api/v1/admin/tenants/${ID}`);
    expect(res.body.data.ltv).toEqual({ total: 297, ciclos: 3, desde: '2026-07-01T12:00:00.000Z' });
  });

  it('plano premium não tem limite de profissionais', async () => {
    repo.linhaNegocio.mockResolvedValue(linha({ plano: 'premium' }));
    const res = await request.get(`/api/v1/admin/tenants/${ID}`);
    expect(res.body.data.uso.limiteProfissionais).toBeNull();
  });

  it('plano basico tem limite numérico de profissionais', async () => {
    repo.linhaNegocio.mockResolvedValue(linha({ plano: 'basico' }));
    const res = await request.get(`/api/v1/admin/tenants/${ID}`);
    expect(typeof res.body.data.uso.limiteProfissionais).toBe('number');
  });

  it('sem FRONTEND_URL a página pública fica null', async () => {
    const res = await request.get(`/api/v1/admin/tenants/${ID}`);
    expect(res.body.data.uso.paginaPublica).toBeNull();
  });

  it('com FRONTEND_URL de barra final e slug ana monta o link da página pública', async () => {
    process.env.FRONTEND_URL = 'https://x.tech/';
    const res = await request.get(`/api/v1/admin/tenants/${ID}`);
    expect(res.body.data.uso.paginaPublica).toBe('https://x.tech/agendar/ana');
  });

  it('próxima cobrança só aparece para ativo e carência', async () => {
    repo.linhaNegocio.mockResolvedValue(linha({ statusAssinatura: 'canceled' }));
    const res = await request.get(`/api/v1/admin/tenants/${ID}`);
    expect(res.body.data.proximaCobranca).toBeNull();
  });

  it('podeEstenderTeste é false para pagante ativo', async () => {
    const res = await request.get(`/api/v1/admin/tenants/${ID}`);
    expect(res.body.data.negocio.podeEstenderTeste).toBe(false);
  });

  it('podeEstenderTeste segue a regra da rota: status normalizado e sem assinatura no gateway', async () => {
    repo.linhaNegocio.mockResolvedValue(linha({ statusAssinatura: ' TRIALING ', jaPagou: false }));
    let res = await request.get(`/api/v1/admin/tenants/${ID}`);
    expect(res.body.data.negocio.podeEstenderTeste).toBe(true);

    repo.linhaNegocio.mockResolvedValue(linha({ statusAssinatura: 'incomplete', jaPagou: false }));
    res = await request.get(`/api/v1/admin/tenants/${ID}`);
    expect(res.body.data.negocio.podeEstenderTeste).toBe(true);

    repo.extrasNegocio.mockResolvedValue({
      slug: 'ana', suspensoMotivo: null, temAssinaturaGateway: true, usuarioDonoId: 'dono1', proximoVencimento: null,
    });
    res = await request.get(`/api/v1/admin/tenants/${ID}`);
    expect(res.body.data.negocio.podeEstenderTeste).toBe(false);
  });

  it('próxima cobrança usa o next_due_date quando existe', async () => {
    const vencimento = new Date('2026-11-15T03:00:00Z');
    repo.extrasNegocio.mockResolvedValue({
      slug: null, suspensoMotivo: null, temAssinaturaGateway: true, usuarioDonoId: null, proximoVencimento: vencimento,
    });
    const res = await request.get(`/api/v1/admin/tenants/${ID}`);
    expect(res.body.data.proximaCobranca.data).toBe(vencimento.toISOString());
  });
});

describe('GET /admin/tenants/:id/auditoria', () => {
  it('categoria financeiro chega ao repositório', async () => {
    repo.auditoria.mockResolvedValue({
      data: [{
        id: 'a1', criadoEm: new Date('2026-10-01T12:00:00Z'), acao: 'SUBSCRIPTION_UPDATED', status: 'success',
        ator: null, detalhes: { plano: 'basico' }, ip: null,
      }],
      total: 1,
    });
    const res = await request.get(`/api/v1/admin/tenants/${ID}/auditoria?categoria=financeiro&page=1&limit=10`);
    expect(res.status).toBe(200);
    expect(repo.auditoria).toHaveBeenCalledWith(ID, 'financeiro', 1, 10);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toMatchObject({ total: 1, page: 1, limit: 10, totalPages: 1 });
  });

  it('categoria desconhecida é recusada com 400', async () => {
    const res = await request.get(`/api/v1/admin/tenants/${ID}/auditoria?categoria=xpto`);
    expect(res.status).toBe(400);
  });
});

describe('GET /admin/tenants/:id/auditoria.csv', () => {
  it('devolve text/csv com o cabeçalho Data;Ação;Status;Ator;IP;Detalhes e detalhes em JSON', async () => {
    repo.auditoria.mockResolvedValue({
      data: [{
        id: 'a1', criadoEm: new Date('2026-10-01T12:00:00Z'), acao: 'TENANT_BLOCK', status: 'success',
        ator: 'admin@x.com', detalhes: { motivo: 'teste' }, ip: '1.2.3.4',
      }],
      total: 1,
    });
    const res = await request.get(`/api/v1/admin/tenants/${ID}/auditoria.csv?categoria=operador`).buffer(true).parse((r, cb) => {
      let s = '';
      r.setEncoding('utf8');
      r.on('data', (c: string) => { s += c; });
      r.on('end', () => cb(null, s));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(repo.auditoria).toHaveBeenCalledWith(ID, 'operador', 1, 5000);
    const linhas = (res.body as string).split('\r\n');
    expect(linhas[0]).toBe('﻿Data;Ação;Status;Ator;IP;Detalhes');
    expect(linhas[1]).toBe('01/10/2026 09:00;TENANT_BLOCK;success;admin@x.com;1.2.3.4;"{""motivo"":""teste""}"');
  });
});
