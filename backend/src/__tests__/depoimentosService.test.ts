import { vi, describe, it, beforeEach, expect } from 'vitest';
import express from 'express';

type Chamada = { sql: string; valores: unknown[] };

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
  $transaction: vi.fn(),
}));
const roleAtual = vi.hoisted(() => ({ valor: 'tenant_admin' }));
vi.mock('../config/prisma.js', () => ({ prisma: prismaMock }));
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { user: unknown }).user = { userId: 'u1', businessId: 'b1', role: roleAtual.valor };
    next();
  },
}));

const { depoimentosService } = await import('../modules/depoimentos/depoimentos.service.js');
const router = (await import('../modules/depoimentos/depoimentos.routes.js')).default;
const { errorHandler } = await import('../middleware/errorHandler.js');
const supertest = (await import('supertest')).default;

const app = express();
app.use(express.json());
app.use('/api/v1/depoimentos', router);
app.use(errorHandler);
const request = supertest(app);

const dono = { businessId: 'b1', role: 'tenant_admin' };
const sql = (s: TemplateStringsArray) => s.join('?').replace(/\s+/g, ' ');
const executadas: Chamada[] = [];
let respostas: Record<string, unknown[]>;

const NEGOCIO = {
  subscription_status: 'active', created_at: new Date('2026-01-01T00:00:00Z'),
  owner_name: 'ana maria da silva', name: 'Barbearia Alfa', logo_url: 'http://logo/x.png',
};

function responder(texto: string): unknown[] {
  for (const [chave, linhas] of Object.entries(respostas)) if (texto.includes(chave)) return linhas;
  return [];
}

beforeEach(() => {
  vi.clearAllMocks();
  executadas.length = 0;
  roleAtual.valor = 'tenant_admin';
  respostas = {
    'FROM businesses': [NEGOCIO],
    'FROM appointments': [{ total: 20n }],
    'FROM depoimento_pedidos': [],
    'FROM depoimentos': [],
  };
  prismaMock.$queryRaw.mockImplementation(async (s: TemplateStringsArray, ...valores: unknown[]) => {
    const texto = sql(s);
    executadas.push({ sql: texto, valores });
    return responder(texto);
  });
  prismaMock.$executeRaw.mockImplementation(async (s: TemplateStringsArray, ...valores: unknown[]) => {
    executadas.push({ sql: sql(s), valores });
    return 1;
  });
  prismaMock.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(prismaMock));
});

const textoValido = 'Sistema muito bom, organizou minha agenda toda.';
const envioBom = { nota: 5, texto: textoValido, nomeExibido: 'Ana S.', cidade: 'Recife', autorizou: true };
const inserts = () => executadas.filter((c) => c.sql.includes('INSERT INTO depoimentos'));
const updates = () => executadas.filter((c) => c.sql.includes('UPDATE depoimentos'));

describe('depoimentosService.enviar', () => {
  it('nota 5 com autorização cria linha pendente copiando dados do negócio', async () => {
    await depoimentosService.enviar(dono, envioBom);
    expect(inserts()).toHaveLength(1);
    const v = inserts()[0].valores;
    expect(v).toContain('pendente');
    expect(v).toContain('Barbearia Alfa');
    expect(v).toContain('http://logo/x.png');
    expect(v.some((x) => x instanceof Date)).toBe(true); // autorizado_em
    expect(v).toContain(true);
  });

  it('nota 2 cria linha interno sem autorização', async () => {
    await depoimentosService.enviar(dono, { nota: 2, texto: 'Faltou lembrete automático', autorizou: true });
    const v = inserts()[0].valores;
    expect(v).toContain('interno');
    expect(v).not.toContain(true);
    expect(v.some((x) => x instanceof Date)).toBe(false);
  });

  it('com publicado existente, envio nota 2 marca o anterior como substituido e o novo como interno', async () => {
    await depoimentosService.enviar(dono, { nota: 2, texto: 'Mudei de ideia, faltou coisa', autorizou: false });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    const up = updates()[0];
    expect(up.sql).toContain("status = 'substituido'");
    expect(up.sql).toContain("status <> 'substituido'");
    expect(up.sql).toContain('atualizado_em = now()');
    expect(executadas.indexOf(up)).toBeLessThan(executadas.indexOf(inserts()[0]));
    expect(inserts()[0].valores).toContain('interno');
  });

  it('recusa texto com 19 caracteres após trim (400)', async () => {
    await expect(depoimentosService.enviar(dono, { ...envioBom, texto: `   ${'a'.repeat(19)}   ` }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(inserts()).toHaveLength(0);
  });

  it('nota >= 4 limita em 400 e nota <= 3 limita em 1000', async () => {
    await expect(depoimentosService.enviar(dono, { ...envioBom, texto: 'a'.repeat(401) }))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(depoimentosService.enviar(dono, { ...envioBom, texto: 'a'.repeat(400) })).resolves.toBeDefined();
    await expect(depoimentosService.enviar(dono, { nota: 3, texto: 'a'.repeat(1001), autorizou: false }))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(depoimentosService.enviar(dono, { nota: 3, texto: 'a'.repeat(1000), autorizou: false })).resolves.toBeDefined();
  });

  it('nota <= 3 aceita texto curto (mínimo 1)', async () => {
    await expect(depoimentosService.enviar(dono, { nota: 1, texto: 'ruim', autorizou: false })).resolves.toBeDefined();
  });

  it('nota >= 4 com autorização exige nomeExibido e cidade', async () => {
    await expect(depoimentosService.enviar(dono, { ...envioBom, nomeExibido: '  ' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(depoimentosService.enviar(dono, { ...envioBom, cidade: undefined })).rejects.toMatchObject({ statusCode: 400 });
  });

  it('nomeExibido aceita 60 e recusa 61 caracteres após trim (400)', async () => {
    await expect(depoimentosService.enviar(dono, { ...envioBom, nomeExibido: ` ${'a'.repeat(60)} ` })).resolves.toBeDefined();
    await expect(depoimentosService.enviar(dono, { ...envioBom, nomeExibido: 'a'.repeat(61) }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('cidade aceita 80 e recusa 81 caracteres após trim (400)', async () => {
    await expect(depoimentosService.enviar(dono, { ...envioBom, cidade: ` ${'a'.repeat(80)} ` })).resolves.toBeDefined();
    await expect(depoimentosService.enviar(dono, { ...envioBom, cidade: 'a'.repeat(81) }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('nota >= 4 sem autorização não exige nome e cidade e vira interno', async () => {
    await depoimentosService.enviar(dono, { nota: 5, texto: textoValido, autorizou: false });
    expect(inserts()[0].valores).toContain('interno');
  });
});

describe('depoimentosService.estado', () => {
  it('mostrarPopup false quando já existe envio e converte BigInt/status', async () => {
    respostas['FROM depoimentos'] = [{
      id: 'd1', status: 'pendente', nota: 5n, texto: 't', nome_exibido: 'Ana S.', cidade: 'Recife',
    }];
    const e = await depoimentosService.estado(dono);
    expect(e.mostrarPopup).toBe(false);
    expect(e.atual).toEqual({ status: 'em_analise', nota: 5, texto: 't', nomeExibido: 'Ana S.', cidade: 'Recife' });
    expect(() => JSON.stringify(e)).not.toThrow();
  });

  it('mostrarPopup true quando elegível, com nomeSugerido', async () => {
    const e = await depoimentosService.estado(dono);
    expect(e).toEqual({ mostrarPopup: true, nomeSugerido: 'Ana M.', atual: null });
  });

  it('mapeia recusado, interno e retirado para nao_publicado', async () => {
    for (const status of ['recusado', 'interno', 'retirado']) {
      respostas['FROM depoimentos'] = [{ id: 'd', status, nota: 2, texto: 't', nome_exibido: null, cidade: null }];
      expect((await depoimentosService.estado(dono)).atual?.status).toBe('nao_publicado');
    }
  });
});

describe('adiar, dispensar e retirar', () => {
  it('adiar grava adiado_ate agora + 30 dias com upsert', async () => {
    const antes = Date.now();
    await depoimentosService.adiar(dono);
    const c = executadas.find((x) => x.sql.includes('INSERT INTO depoimento_pedidos'))!;
    expect(c.sql).toContain('ON CONFLICT (business_id) DO UPDATE');
    const d = c.valores.find((x) => x instanceof Date) as Date;
    expect(d.getTime() - antes).toBeGreaterThanOrEqual(30 * 86_400_000 - 1000);
  });

  it('dispensar grava dispensado_em com upsert', async () => {
    await depoimentosService.dispensar(dono);
    const c = executadas.find((x) => x.sql.includes('INSERT INTO depoimento_pedidos'))!;
    expect(c.sql).toContain('dispensado_em');
    expect(c.sql).toContain('ON CONFLICT (business_id) DO UPDATE');
  });

  it('retirar marca publicado/pendente como retirado e é idempotente', async () => {
    const e = await depoimentosService.retirar(dono);
    const up = updates()[0];
    expect(up.sql).toContain("status = 'retirado'");
    expect(up.sql).toContain("status IN ('publicado', 'pendente')");
    expect(up.sql).toContain('atualizado_em = now()');
    expect(e).toHaveProperty('mostrarPopup');
  });
});

describe('rotas', () => {
  it('professional recebe 403 em todas as rotas', async () => {
    roleAtual.valor = 'employee';
    for (const [m, u] of [['get', '/meu'], ['post', ''], ['post', '/adiar'], ['post', '/dispensar'], ['post', '/retirar']] as const) {
      const res = await request[m](`/api/v1/depoimentos${u}`).send({});
      expect(res.status).toBe(403);
    }
  });

  it('GET /meu devolve estado serializável', async () => {
    const res = await request.get('/api/v1/depoimentos/meu');
    expect(res.status).toBe(200);
    expect(res.body.data.mostrarPopup).toBe(true);
  });

  it('POST / valida corpo (nota 6 dá 400) e aceita envio válido', async () => {
    expect((await request.post('/api/v1/depoimentos').send({ ...envioBom, nota: 6 })).status).toBe(400);
    expect((await request.post('/api/v1/depoimentos').send(envioBom)).status).toBe(200);
  });
});
