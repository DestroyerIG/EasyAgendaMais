import { vi, describe, it, beforeEach, expect } from 'vitest';
import express from 'express';

type Chamada = { sql: string; valores: unknown[] };

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
  $transaction: vi.fn(),
}));
const auditMock = vi.hoisted(() => ({ logAdminAction: vi.fn() }));
vi.mock('../config/prisma.js', () => ({ prisma: prismaMock }));
vi.mock('../services/auditLogService.js', () => ({ auditLogService: auditMock }));
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { user: unknown }).user = { userId: 'admin1', businessId: null, role: 'platform_admin' };
    next();
  },
}));

const { authMiddleware } = await import('../middleware/auth.js');
const { requireAdmin } = await import('../middleware/rbac.js');
const router = (await import('../modules/depoimentos/depoimentos.admin.routes.js')).default;
const { errorHandler } = await import('../middleware/errorHandler.js');
const supertest = (await import('supertest')).default;

const app = express();
app.use(express.json());
app.use('/api/v1/admin/depoimentos', authMiddleware, requireAdmin, router);
app.use(errorHandler);
const request = supertest(app);

const ID = '11111111-1111-4111-8111-111111111111';
const sql = (s: TemplateStringsArray) => s.join('?').replace(/\s+/g, ' ');
const executadas: Chamada[] = [];
let respostas: Array<[string, unknown[]]>;

function responder(texto: string): unknown[] {
  for (const [chave, linhas] of respostas) if (texto.includes(chave)) return linhas;
  return [];
}

beforeEach(() => {
  vi.clearAllMocks();
  executadas.length = 0;
  respostas = [];
  prismaMock.$queryRaw.mockImplementation(async (s: TemplateStringsArray, ...valores: unknown[]) => {
    const texto = sql(s);
    executadas.push({ sql: texto, valores });
    return responder(texto);
  });
});

const LINHA = {
  id: ID, negocio_nome: 'Barbearia Alfa', business_id: 'b1', plano: 'pro', nome_exibido: 'Ana S.',
  cidade: 'Recife', nota: 5, texto: 'Sistema muito bom, organizou minha agenda.', texto_original: null,
  autorizado_em: new Date('2026-10-01T00:00:00Z'), criado_em: new Date('2026-10-01T00:00:00Z'), status: 'pendente',
};

describe('GET /admin/depoimentos', () => {
  it('lista a aba e devolve meta.publicados como número', async () => {
    respostas = [['count(*)', [{ total: 3n }]], ['FROM depoimentos d', [{ ...LINHA, nota: 5n }]]];
    const res = await request.get('/api/v1/admin/depoimentos?aba=pendentes');
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({
      id: ID, negocio: 'Barbearia Alfa', negocioId: 'b1', plano: 'pro', nomeExibido: 'Ana S.', nota: 5,
      textoOriginal: null, status: 'pendente',
    });
    expect(res.body.meta.publicados).toBe(3);
    const lista = executadas.find((c) => c.sql.includes('FROM depoimentos d'))!;
    expect(lista.sql).toContain('ASC');
    expect(lista.valores.flat()).toContain('pendente');
  });

  it('aba internos inclui interno e retirado', async () => {
    await request.get('/api/v1/admin/depoimentos?aba=internos');
    const lista = executadas.find((c) => c.sql.includes('FROM depoimentos d'))!;
    expect(lista.valores.flat()).toEqual(expect.arrayContaining(['interno', 'retirado']));
    expect(lista.sql).toContain('DESC');
  });

  it('aba inválida ou ausente devolve 400', async () => {
    expect((await request.get('/api/v1/admin/depoimentos?aba=x')).status).toBe(400);
    expect((await request.get('/api/v1/admin/depoimentos')).status).toBe(400);
  });

  it('meta.publicados conta só status publicado', async () => {
    await request.get('/api/v1/admin/depoimentos?aba=recusados');
    const c = executadas.find((x) => x.sql.includes('count(*)'))!;
    expect(c.sql).toContain("status = 'publicado'");
  });

  it('meta.publicados usa o mesmo JOIN e filtros da landing', async () => {
    await request.get('/api/v1/admin/depoimentos?aba=recusados');
    const c = executadas.find((x) => x.sql.includes('count(*)'))!;
    expect(c.sql).toContain('JOIN businesses b ON b.id = d.business_id');
    expect(c.sql).toContain('d.autorizou = true');
    expect(c.sql).toContain("b.active = true AND b.subscription_status = 'active'");
    expect(c.sql).not.toContain('LIMIT');
  });
});

describe('POST publicar / recusar', () => {
  it('publica um pendente e audita', async () => {
    respostas = [['UPDATE depoimentos', [{ id: ID, business_id: 'b1' }]]];
    const res = await request.post(`/api/v1/admin/depoimentos/${ID}/publicar`);
    expect(res.status).toBe(200);
    const up = executadas.find((c) => c.sql.includes('UPDATE depoimentos'))!;
    expect(up.sql).toContain("status = 'publicado'");
    expect(up.sql).toContain("status = 'pendente'");
    expect(up.sql).toContain('atualizado_em = now()');
    expect(up.valores).toContain('admin1');
    expect(auditMock.logAdminAction).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'DEPOIMENTO_PUBLICADO', actorUserId: 'admin1', actorBusinessId: null,
      targetBusinessId: 'b1', resourceType: 'depoimento', resourceId: ID,
    }));
  });

  it('falha ao gravar a auditoria não derruba a operação já feita', async () => {
    respostas = [['UPDATE depoimentos', [{ id: ID, business_id: 'b1' }]]];
    auditMock.logAdminAction.mockRejectedValueOnce(new Error('audit fora'));
    const res = await request.post(`/api/v1/admin/depoimentos/${ID}/publicar`);
    expect(res.status).toBe(200);
  });

  it('publicar interno ou substituído devolve 409 sem auditar', async () => {
    respostas = [['SELECT status', [{ status: 'interno' }]]];
    const res = await request.post(`/api/v1/admin/depoimentos/${ID}/publicar`);
    expect(res.status).toBe(409);
    respostas = [['SELECT status', [{ status: 'substituido' }]]];
    expect((await request.post(`/api/v1/admin/depoimentos/${ID}/publicar`)).status).toBe(409);
    expect(auditMock.logAdminAction).not.toHaveBeenCalled();
  });

  it('id inexistente devolve 404', async () => {
    expect((await request.post(`/api/v1/admin/depoimentos/${ID}/recusar`)).status).toBe(404);
  });

  it('id que não é uuid devolve 400', async () => {
    expect((await request.post('/api/v1/admin/depoimentos/abc/recusar')).status).toBe(400);
  });

  it('recusa um pendente e audita', async () => {
    respostas = [['UPDATE depoimentos', [{ id: ID, business_id: 'b1' }]]];
    const res = await request.post(`/api/v1/admin/depoimentos/${ID}/recusar`);
    expect(res.status).toBe(200);
    expect(auditMock.logAdminAction).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'DEPOIMENTO_RECUSADO' }));
  });
});

describe('POST corrigir', () => {
  const texto = 'Texto corrigido com tamanho suficiente.';

  it('corrige pendente/publicado guardando o original só na primeira vez', async () => {
    respostas = [['UPDATE depoimentos', [{ id: ID, business_id: 'b1' }]]];
    const res = await request.post(`/api/v1/admin/depoimentos/${ID}/corrigir`).send({ texto: `  ${texto}  ` });
    expect(res.status).toBe(200);
    const up = executadas.find((c) => c.sql.includes('UPDATE depoimentos'))!;
    expect(up.sql).toContain('texto_original = COALESCE(texto_original, texto)');
    expect(up.sql).toContain("status IN ('pendente', 'publicado')");
    expect(up.sql).toContain('atualizado_em = now()');
    expect(up.valores).toContain(texto);
    expect(auditMock.logAdminAction).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'DEPOIMENTO_CORRIGIDO' }));
  });

  it('corrigir um interno devolve 409', async () => {
    respostas = [['SELECT status', [{ status: 'interno' }]]];
    expect((await request.post(`/api/v1/admin/depoimentos/${ID}/corrigir`).send({ texto })).status).toBe(409);
  });

  it('texto fora dos limites devolve 400', async () => {
    expect((await request.post(`/api/v1/admin/depoimentos/${ID}/corrigir`).send({ texto: 'curto' })).status).toBe(400);
    expect((await request.post(`/api/v1/admin/depoimentos/${ID}/corrigir`).send({ texto: 'x'.repeat(401) })).status).toBe(400);
    expect((await request.post(`/api/v1/admin/depoimentos/${ID}/corrigir`).send({})).status).toBe(400);
  });
});
