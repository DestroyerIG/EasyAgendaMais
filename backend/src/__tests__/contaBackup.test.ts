import { vi, describe, it, beforeEach, expect } from 'vitest';
import express from 'express';

const prismaMock = vi.hoisted(() => ({
  client: { findMany: vi.fn() },
  appointment: { findMany: vi.fn() },
  service: { findMany: vi.fn() },
  professional: { findMany: vi.fn() },
  comandaItem: { findMany: vi.fn() },
  cashSession: { findMany: vi.fn() },
  cashMovement: { findMany: vi.fn() },
  expense: { findMany: vi.fn() },
  business: { findUnique: vi.fn() },
  auditLog: { create: vi.fn() },
}));
const estado = vi.hoisted(() => ({ doNegocio: vi.fn() }));
const papel = vi.hoisted(() => ({ atual: 'tenant_admin' }));

vi.mock('../config/prisma.js', () => ({ prisma: prismaMock }));
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { user: unknown }).user = { userId: 'u1', businessId: 'b1', role: papel.atual };
    next();
  },
}));
vi.mock('../modules/conta/estadoConta.service.js', () => ({ estadoContaService: estado }));

const JSZip = (await import('jszip')).default;
const { backupService } = await import('../modules/conta/backup.service.js');
const router = (await import('../modules/conta/conta.routes.js')).default;
const { errorHandler } = await import('../middleware/errorHandler.js');
const supertest = (await import('supertest')).default;

const app = express();
app.use(express.json());
app.use('/api/v1/conta', router);
app.use(errorHandler);
const request = supertest(app);

const ARQUIVOS = ['agendamentos.csv', 'caixa.csv', 'clientes.csv', 'comandas.csv', 'despesas.csv', 'profissionais.csv', 'servicos.csv'];

beforeEach(() => {
  vi.clearAllMocks();
  papel.atual = 'tenant_admin';
  for (const m of ['client', 'appointment', 'service', 'professional', 'comandaItem', 'cashSession', 'cashMovement', 'expense'] as const) {
    prismaMock[m].findMany.mockResolvedValue([]);
  }
  prismaMock.business.findUnique.mockResolvedValue({ slug: 'studio-ana' });
  prismaMock.auditLog.create.mockResolvedValue({});
});

describe('backupService.gerar', () => {
  it('devolve um zip com exatamente os 7 arquivos', async () => {
    const buf = await backupService.gerar('b1');
    expect(Buffer.isBuffer(buf)).toBe(true);
    const zip = await JSZip.loadAsync(buf);
    expect(Object.keys(zip.files).sort()).toEqual(ARQUIVOS);
  });

  it('clientes.csv tem BOM, cabeçalho e uma linha por cliente', async () => {
    prismaMock.client.findMany.mockResolvedValue([
      { name: 'Ana', phone: '11999990000', email: 'ana@x.com', birthDate: new Date('1990-05-17T00:00:00Z'), createdAt: new Date('2026-01-02T15:00:00Z') },
    ]);
    const zip = await JSZip.loadAsync(await backupService.gerar('b1'));
    const csv = await zip.file('clientes.csv')!.async('string');
    expect(csv.startsWith('﻿')).toBe(true);
    const linhas = csv.slice(1).trim().split('\r\n');
    expect(linhas[0]).toBe('Nome;Telefone;E-mail;Aniversário;Cadastrada em');
    expect(linhas).toHaveLength(2);
    expect(linhas[1]).toBe('Ana;11999990000;ana@x.com;17/05/1990;02/01/2026');
  });

  it('comandas.csv gera uma linha por item, com decimal em vírgula', async () => {
    prismaMock.comandaItem.findMany.mockResolvedValue([
      {
        name: 'Corte', kind: 'service', unitPrice: 45.5, quantity: 2,
        comanda: {
          number: 7, status: 'fechada', closedAt: new Date('2026-03-04T12:00:00Z'), createdAt: new Date('2026-03-04T10:00:00Z'),
          paymentMethod: 'pix', totalCharged: 91, client: { name: 'Ana' }, professional: { name: 'Bia' },
        },
      },
    ]);
    const zip = await JSZip.loadAsync(await backupService.gerar('b1'));
    const csv = await zip.file('comandas.csv')!.async('string');
    const linhas = csv.slice(1).trim().split('\r\n');
    expect(linhas).toHaveLength(2);
    expect(linhas[1]).toContain('45,50');
    expect(linhas[1]).toContain('Ana');
  });

  it('toda consulta recebe o businessId', async () => {
    await backupService.gerar('b1');
    for (const m of ['client', 'appointment', 'service', 'professional', 'cashSession', 'cashMovement', 'expense'] as const) {
      expect(prismaMock[m].findMany).toHaveBeenCalledTimes(1);
      expect(prismaMock[m].findMany.mock.calls[0]![0].where).toEqual({ businessId: 'b1' });
    }
    expect(prismaMock.comandaItem.findMany.mock.calls[0]![0].where).toEqual({ comanda: { businessId: 'b1' } });
  });
});

describe('rotas da conta', () => {
  it('GET /backup com profissional → 403 e sem consulta', async () => {
    papel.atual = 'professional';
    const r = await request.get('/api/v1/conta/backup');
    expect(r.status).toBe(403);
    expect(prismaMock.client.findMany).not.toHaveBeenCalled();
  });

  it('GET /backup com tenant_admin → zip e auditoria', async () => {
    const r = await request.get('/api/v1/conta/backup').buffer(true).parse((res, cb) => {
      const partes: Buffer[] = [];
      res.on('data', (c: Buffer) => partes.push(c));
      res.on('end', () => cb(null, Buffer.concat(partes)));
    });
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toContain('application/zip');
    expect(r.headers['content-disposition']).toMatch(/^attachment; filename="backup-studio-ana-\d{4}-\d{2}-\d{2}\.zip"$/);
    const zip = await JSZip.loadAsync(r.body as Buffer);
    expect(Object.keys(zip.files)).toHaveLength(7);
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
    const dado = prismaMock.auditLog.create.mock.calls[0]![0].data;
    expect(dado.actionType).toBe('conta_backup');
    expect(dado.actorBusinessId).toBe('b1');
  });

  it('GET /estado devolve o estado com datas em ISO, para a equipe também', async () => {
    papel.atual = 'employee';
    const ate = new Date('2026-11-05T12:00:00Z');
    estado.doNegocio.mockResolvedValue({ tipo: 'carencia', desde: new Date('2026-10-29T12:00:00Z'), ate, diasRestantes: 5 });
    const r = await request.get('/api/v1/conta/estado');
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ tipo: 'carencia', desde: '2026-10-29T12:00:00.000Z', ate: '2026-11-05T12:00:00.000Z', diasRestantes: 5 });
  });
});
