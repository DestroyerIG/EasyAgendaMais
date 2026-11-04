import { vi, describe, it, beforeEach, expect } from 'vitest';
import express from 'express';

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
  $transaction: vi.fn(),
}));
vi.mock('../config/prisma.js', () => ({ prisma: prismaMock }));

const router = (await import('../modules/depoimentos/depoimentos.routes.js')).default;
const { errorHandler } = await import('../middleware/errorHandler.js');
const supertest = (await import('supertest')).default;

const app = express();
app.use(express.json());
app.use('/api/v1/depoimentos', router);
app.use(errorHandler);
const request = supertest(app);

const sql = (s: TemplateStringsArray) => s.join('?').replace(/\s+/g, ' ');
let texto = '';
let valores: unknown[] = [];

const LINHA = {
  texto: 'Organizou minha agenda.', nota: 5n, nome_exibido: 'Ana S.', negocio_nome: 'Barbearia Alfa',
  cidade: 'Recife', logo_url: 'https://x/logo.png',
};

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$queryRaw.mockImplementation(async (s: TemplateStringsArray, ...v: unknown[]) => {
    texto = sql(s);
    valores = v;
    return [LINHA];
  });
});

describe('GET /depoimentos/publicos', () => {
  it('é público e filtra publicados de negócios ativos com assinatura em dia', async () => {
    const res = await request.get('/api/v1/depoimentos/publicos');
    expect(res.status).toBe(200);
    expect(texto).toContain("d.status = 'publicado'");
    expect(texto).toContain('d.autorizou = true');
    expect(texto).toContain('b.active = true');
    expect(texto).toContain("b.subscription_status = 'active'");
    expect(texto).toContain('JOIN businesses b ON b.id = d.business_id');
    expect(texto).toContain('ORDER BY d.publicado_em DESC');
    expect(valores).toEqual([6]);
  });

  it('devolve só as seis chaves, com nota numérica', async () => {
    const res = await request.get('/api/v1/depoimentos/publicos');
    const itens = res.body.data ?? res.body;
    expect(itens).toEqual([{
      texto: 'Organizou minha agenda.', nota: 5, nomeExibido: 'Ana S.', negocio: 'Barbearia Alfa',
      cidade: 'Recife', logoUrl: 'https://x/logo.png',
    }]);
    expect(Object.keys(itens[0]).sort()).toEqual(['cidade', 'logoUrl', 'negocio', 'nomeExibido', 'nota', 'texto']);
  });
});
