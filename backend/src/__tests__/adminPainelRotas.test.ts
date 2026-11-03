import { vi, describe, it, beforeEach, expect } from 'vitest';
import express from 'express';
import type { LinhaNegocio } from '../modules/admin/painel.rules.js';

const repo = vi.hoisted(() => ({
  linhasNegocios: vi.fn(),
  linhaNegocio: vi.fn(),
  disparos24h: vi.fn(),
}));
const papel = vi.hoisted(() => ({ atual: 'platform_admin' }));

vi.mock('../config/prisma.js', () => ({ prisma: {} }));
vi.mock('../modules/admin/painel.repository.js', () => ({ painelRepository: repo }));
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { user: unknown }).user = { userId: 'u1', businessId: null, role: papel.atual };
    next();
  },
}));

const { PLAN_PRICES } = await import('../config/planCatalog.js');
const router = (await import('../routes/admin.js')).default;
const { errorHandler } = await import('../middleware/errorHandler.js');
const supertest = (await import('supertest')).default;

const app = express();
app.use(express.json());
app.use('/api/v1/admin', router);
app.use(errorHandler);
const request = supertest(app);

const MS_DIA = 86_400_000;
const dias = (n: number) => new Date(Date.now() + n * MS_DIA);

let seq = 0;
function linha(parcial: Partial<LinhaNegocio> = {}): LinhaNegocio {
  seq += 1;
  return {
    id: `n${seq}`, nome: `Negócio ${seq}`, dono: 'Dona', email: `n${seq}@b.com`, whatsapp: '11999999999',
    cpfCnpj: null, endereco: null, segmento: 'barbearia',
    plano: 'profissional', statusAssinatura: 'active', ativo: true,
    inadimplenteDesde: null, jaPagou: true, fimDoPeriodo: null, pix: false,
    criadoEm: dias(-100 + seq), canceladoEm: null, onboardingConcluido: true,
    temInstanciaWhatsapp: false, whatsappConectadoEm: null, ultimoEnvioEm: null,
    agendamentos30d: 0, ultimoAgendamentoEm: null,
    primeiroPagamentoEm: null, pagouMesAnterior: false,
    ...parcial,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  papel.atual = 'platform_admin';
  seq = 0;
  repo.disparos24h.mockResolvedValue([{ origem: 'lembrete', enviados: 10, falhos: 1 }]);
});

describe('GET /admin/metrics', () => {
  it('devolve a visão geral com o MRR somado dos pagantes e atualizadoEm em ISO', async () => {
    repo.linhasNegocios.mockResolvedValue([
      linha({ plano: 'basico' }),
      linha({ plano: 'premium', statusAssinatura: 'past_due', inadimplenteDesde: dias(-2) }),
      linha({ plano: 'premium', statusAssinatura: 'trialing', jaPagou: false }),
      linha({ plano: 'premium', statusAssinatura: 'canceled' }),
    ]);
    const res = await request.get('/api/v1/admin/metrics?periodDays=30');
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.mrr.mrr).toBe(PLAN_PRICES.basico + PLAN_PRICES.premium);
    expect(new Date(d.atualizadoEm).toISOString()).toBe(d.atualizadoEm);
    expect(d.testes.ativos).toBe(1);
    expect(d.disparos24h).toEqual([{ origem: 'lembrete', enviados: 10, falhos: 1 }]);
    expect(Array.isArray(d.emRisco)).toBe(true);
    expect(d.conversao).toHaveProperty('geral');
    expect(d.cancelamentos).toHaveProperty('retencaoPct');
    expect(repo.linhasNegocios).toHaveBeenCalledTimes(1);
  });

  it('perfil tenant_admin recebe 403', async () => {
    papel.atual = 'tenant_admin';
    const res = await request.get('/api/v1/admin/metrics');
    expect(res.status).toBe(403);
    expect(repo.linhasNegocios).not.toHaveBeenCalled();
  });
});

describe('GET /admin/tenants', () => {
  it('filtra por status carencia e meta.total conta só eles; cartões e segmentos usam a base inteira', async () => {
    repo.linhasNegocios.mockResolvedValue([
      linha(),
      linha({ statusAssinatura: 'past_due', inadimplenteDesde: dias(-2), segmento: 'unhas' }),
      linha({ statusAssinatura: 'past_due', inadimplenteDesde: dias(-1) }),
      linha({ statusAssinatura: 'past_due', inadimplenteDesde: dias(-20) }),
      linha({ statusAssinatura: 'trialing', jaPagou: false, segmento: null }),
    ]);
    const res = await request.get('/api/v1/admin/tenants?status=carencia');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.every((n: { status: string }) => n.status === 'carencia')).toBe(true);
    expect(res.body.meta).toEqual({ total: 2, page: 1, limit: 20, totalPages: 1 });
    expect(res.body.cartoes.base).toBe(5);
    const seg = Object.fromEntries(res.body.segmentos.map((s: { segmento: string; total: number }) => [s.segmento, s.total]));
    expect(seg).toMatchObject({ barbearia: 3, unhas: 1, outro: 1 });
  });

  it('ordena pela criação mais recente e calcula diasRestantesTeste só no teste', async () => {
    repo.linhasNegocios.mockResolvedValue([
      linha({ nome: 'Antigo', criadoEm: dias(-50) }),
      linha({ nome: 'Novo', criadoEm: dias(-1), statusAssinatura: 'trialing', jaPagou: false, fimDoPeriodo: new Date(Date.now() + 2.5 * MS_DIA) }),
    ]);
    const res = await request.get('/api/v1/admin/tenants');
    expect(res.body.data.map((n: { nome: string }) => n.nome)).toEqual(['Novo', 'Antigo']);
    expect(res.body.data[0].diasRestantesTeste).toBe(3);
    expect(res.body.data[1].diasRestantesTeste).toBeNull();
    expect(res.body.data[0].preco).toBe(PLAN_PRICES.profissional);
  });

  it('limit=6 e page=2 com 8 negócios devolve 2 itens e totalPages 2', async () => {
    repo.linhasNegocios.mockResolvedValue(Array.from({ length: 8 }, () => linha()));
    const res = await request.get('/api/v1/admin/tenants?limit=6&page=2');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta).toMatchObject({ total: 8, page: 2, limit: 6, totalPages: 2 });
  });

  it('limit=7 é recusado com 400', async () => {
    repo.linhasNegocios.mockResolvedValue([]);
    const res = await request.get('/api/v1/admin/tenants?limit=7');
    expect(res.status).toBe(400);
  });

  it('busca só por dígitos acha o WhatsApp formatado', async () => {
    repo.linhasNegocios.mockResolvedValue([
      linha({ nome: 'Alvo', whatsapp: '(83) 98842-1920' }),
      linha({ nome: 'Outro', whatsapp: '(11) 99999-0000' }),
    ]);
    const res = await request.get('/api/v1/admin/tenants?busca=83988421920');
    expect(res.status).toBe(200);
    expect(res.body.data.map((n: { nome: string }) => n.nome)).toEqual(['Alvo']);
  });

  it('busca com letras e número não casa telefone nem CPF pelo dígito solto', async () => {
    repo.linhasNegocios.mockResolvedValue([
      linha({ nome: 'Barbearia 2' }),
      linha({ nome: 'Studio Lia', whatsapp: '(11) 92222-0000', cpfCnpj: '222.333.444-55' }),
    ]);
    const res = await request.get('/api/v1/admin/tenants?busca=Barbearia%202');
    expect(res.body.data.map((n: { nome: string }) => n.nome)).toEqual(['Barbearia 2']);
  });

  it('busca com menos de 4 dígitos não compara telefone', async () => {
    repo.linhasNegocios.mockResolvedValue([
      linha({ nome: 'Studio Lia', whatsapp: '(11) 92222-0000' }),
    ]);
    const res = await request.get('/api/v1/admin/tenants?busca=922');
    expect(res.body.data).toEqual([]);
  });

  it('busca de CPF formatado com 4 ou mais dígitos acha o documento', async () => {
    repo.linhasNegocios.mockResolvedValue([
      linha({ nome: 'Studio Lia', cpfCnpj: '22233344455' }),
      linha({ nome: 'Outro' }),
    ]);
    const res = await request.get('/api/v1/admin/tenants?busca=222.333');
    expect(res.body.data.map((n: { nome: string }) => n.nome)).toEqual(['Studio Lia']);
  });

  it('cada negócio listado diz se tem instância de WhatsApp', async () => {
    repo.linhasNegocios.mockResolvedValue([
      linha({ nome: 'Com', temInstanciaWhatsapp: true }),
      linha({ nome: 'Sem', temInstanciaWhatsapp: false }),
    ]);
    const res = await request.get('/api/v1/admin/tenants');
    const porNome = Object.fromEntries(
      res.body.data.map((n: { nome: string; temInstanciaWhatsapp: boolean }) => [n.nome, n.temInstanciaWhatsapp]),
    );
    expect(porNome).toEqual({ Com: true, Sem: false });
  });

  it('busca ignora acentos e maiúsculas no nome', async () => {
    repo.linhasNegocios.mockResolvedValue([
      linha({ nome: 'Salão da Conceição' }),
      linha({ nome: 'Barbearia Beta' }),
    ]);
    const res = await request.get('/api/v1/admin/tenants?busca=SALAO%20DA%20conceicao');
    expect(res.body.data.map((n: { nome: string }) => n.nome)).toEqual(['Salão da Conceição']);
  });
});

describe('GET /admin/tenants/export.csv', () => {
  it('devolve CSV com BOM e cabeçalho Negócio;Dono, sem paginação', async () => {
    repo.linhasNegocios.mockResolvedValue(Array.from({ length: 25 }, () => linha()));
    const res = await request.get('/api/v1/admin/tenants/export.csv').buffer(true).parse((r, cb) => {
      let s = '';
      r.setEncoding('utf8');
      r.on('data', (c: string) => { s += c; });
      r.on('end', () => cb(null, s));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toBe('attachment; filename="negocios.csv"');
    const texto = res.body as string;
    const linhas = texto.split('\r\n');
    expect(linhas[0].startsWith('﻿Negócio;Dono')).toBe(true);
    expect(linhas.filter(Boolean)).toHaveLength(26);
    expect(linhas[1]).toContain(`;${PLAN_PRICES.profissional.toFixed(2).replace('.', ',')};`);
  });
});
