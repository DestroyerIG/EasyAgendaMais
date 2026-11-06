import { vi, describe, it, beforeEach, expect } from 'vitest';
import express from 'express';

const mockHandleIncomingMessage = vi.hoisted(() => vi.fn());
const mockPoolQuery = vi.hoisted(() => vi.fn());
const mockSendWhatsAppMessage = vi.hoisted(() => vi.fn());
const mockDeleteSession = vi.hoisted(() => vi.fn());

vi.mock('../services/whatsapp/whatsappSessionService.js', () => ({ deleteSession: mockDeleteSession }));

let mockAuthenticatedUser: {
  userId: string;
  businessId: string | null;
  email: string;
  plan: string;
  role: string;
} = {
  userId: 'user-1',
  businessId: 'tenant-1',
  email: 'tenant@test.com',
  plan: 'premium',
  role: 'tenant_admin',
};

vi.mock('../services/whatsapp/index.js', () => ({
  handleIncomingMessage: mockHandleIncomingMessage,
  sendWhatsAppMessage: mockSendWhatsAppMessage,
}));

vi.mock('../services/whatsappClient.js', () => ({
  getWhatsAppStatus: vi.fn(() => ({ connectedNumber: null })),
  getWhatsAppStatusByInstance: vi.fn(() => ({ connectedNumber: null })),
  getConnectedNumberCached: vi.fn(() => null),
  connectWhatsApp: vi.fn(),
  disconnectWhatsApp: vi.fn(),
  getWhatsAppQrCode: vi.fn(),
  sendWhatsAppText: vi.fn(),
  refreshWhatsAppStatus: vi.fn(),
  logoutWhatsApp: vi.fn(),
  restartWhatsApp: vi.fn(),
  initializeWhatsAppInstance: vi.fn(),
}));

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as express.Request & { user: typeof mockAuthenticatedUser }).user = { ...mockAuthenticatedUser };
    next();
  },
}));

vi.mock('../middleware/rbac.js', () => ({
  requireTenantRoles: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

vi.mock('../middleware/subscriptionGuard.js', () => ({
  requireFeature: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

vi.mock('../config/database.js', () => ({
  default: {
    query: mockPoolQuery,
  },
}));

vi.mock('../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
}));

vi.mock('../config/prisma.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'tenant-1', name: 'Professional Test', whatsapp_instance_name: 'instance-1' }]),
    $executeRaw: vi.fn().mockResolvedValue(0),
    $transaction: vi.fn(async (cb: unknown) => {
      if (typeof cb === 'function') return (cb as (tx: unknown) => unknown)({});
      return cb;
    }),
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    business: {
      findFirst: vi.fn().mockResolvedValue({ id: 'tenant-1', name: 'Professional Test', whatsappInstanceName: 'instance-1' }),
      findUnique: vi.fn().mockResolvedValue({ id: 'tenant-1', name: 'Professional Test' }),
    },
  },
}));

const router = (await import('../routes/whatsapp.js')).default;
const supertest = (await import('supertest')).default;

const app = express();
app.use(express.json());
app.use('/api/v1/whatsapp', router);
app.use((err: { statusCode?: number; code?: string; message?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(err?.statusCode || 500).json({
    success: false,
    error: {
      code: err?.code || 'INTERNAL_ERROR',
      message: err?.message || 'Erro inesperado',
    },
  });
});

const request = supertest(app);

describe('POST /api/v1/whatsapp/test-send', () => {
  it('envia por sendWhatsAppMessage com origem sistema para ser gravado', async () => {
    mockSendWhatsAppMessage.mockResolvedValue(true);
    const response = await request.post('/api/v1/whatsapp/test-send').send({ phone: '5583999990000', message: 'teste' });
    expect(response.status).toBe(200);
    expect(response.body.data.sent).toBe(true);
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      expect.any(String),
      'teste',
      expect.objectContaining({ businessId: 'tenant-1', origin: 'sistema' }),
    );
  });
});

describe('POST /api/v1/whatsapp/simulator/message', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockAuthenticatedUser = {
      userId: 'user-1',
      businessId: 'tenant-1',
      email: 'tenant@test.com',
      plan: 'premium',
      role: 'tenant_admin',
    };

    mockPoolQuery.mockResolvedValue({ rows: [{ id: 'tenant-1' }] });
    mockHandleIncomingMessage.mockResolvedValue({
      ok: true,
      ignored: false,
      reason: null,
    });
  });

  it('processa simulador com businessId valido no payload', async () => {
    const response = await request
      .post('/api/v1/whatsapp/simulator/message')
      .send({ text: 'oi', businessId: 'tenant-1' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.processed).toBe(true);
    expect(mockHandleIncomingMessage).toHaveBeenCalledWith(
      expect.any(Object),
      'oi',
      expect.objectContaining({
        simulationMode: true,
        businessId: 'tenant-1',
        businessContextSource: 'payload',
      })
    );
  });

  it('usa businessId do contexto autenticado quando payload nao informa', async () => {
    const response = await request
      .post('/api/v1/whatsapp/simulator/message')
      .send({ text: 'oi' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(mockHandleIncomingMessage).toHaveBeenCalledWith(
      expect.any(Object),
      'oi',
      expect.objectContaining({
        simulationMode: true,
        businessId: 'tenant-1',
        businessContextSource: 'auth',
      })
    );
  });

  it('falha com erro claro quando contexto de business nao esta disponivel', async () => {
    mockAuthenticatedUser = {
      userId: 'user-1',
      businessId: null,
      email: 'tenant@test.com',
      plan: 'premium',
      role: 'tenant_admin',
    };

    const response = await request
      .post('/api/v1/whatsapp/simulator/message')
      .send({ text: 'oi' });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('WHATSAPP_SIMULATOR_BUSINESS_REQUIRED');
    expect(mockHandleIncomingMessage).not.toHaveBeenCalled();
  });

  it('rejeita payload com businessId diferente do tenant autenticado', async () => {
    const response = await request
      .post('/api/v1/whatsapp/simulator/message')
      .send({ text: 'oi', businessId: 'tenant-2' });

    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('WHATSAPP_SIMULATOR_BUSINESS_FORBIDDEN');
    expect(mockHandleIncomingMessage).not.toHaveBeenCalled();
  });

  it('nao retorna 200 silencioso quando fluxo responde business_not_resolved', async () => {
    mockHandleIncomingMessage.mockResolvedValue({
      ok: false,
      ignored: true,
      reason: 'business_not_resolved',
    });

    const response = await request
      .post('/api/v1/whatsapp/simulator/message')
      .send({ text: 'oi', businessId: 'tenant-1' });

    expect(response.status).toBe(422);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('WHATSAPP_SIMULATOR_CONTEXT_UNRESOLVED');
  });
});

describe('POST /api/v1/whatsapp/simulator/reset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticatedUser = {
      userId: 'user-1',
      businessId: 'tenant-1',
      email: 'tenant@test.com',
      plan: 'premium',
      role: 'tenant_admin',
    };
    mockPoolQuery.mockResolvedValue({ rows: [{ id: 'tenant-1' }] });
  });

  it('ignora o telefone do corpo e apaga so a sessao do numero do simulador', async () => {
    const response = await request
      .post('/api/v1/whatsapp/simulator/reset')
      .send({ phone: '5583999990000' });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ reiniciado: true });
    expect(mockDeleteSession).toHaveBeenCalledTimes(1);
    expect(mockDeleteSession).toHaveBeenCalledWith('5511999999999', 'tenant-1');
  });

  it('sem telefone usa o numero padrao do simulador', async () => {
    await request.post('/api/v1/whatsapp/simulator/reset').send({});

    expect(mockDeleteSession).toHaveBeenCalledWith('5511999999999', 'tenant-1');
  });

  it('rejeita businessId de outro negocio sem apagar nada', async () => {
    const response = await request
      .post('/api/v1/whatsapp/simulator/reset')
      .send({ businessId: 'tenant-2' });

    expect(response.status).toBe(403);
    expect(mockDeleteSession).not.toHaveBeenCalled();
  });
});

describe('PUT /api/v1/whatsapp/config/instagram', () => {
  const atualizar = async () => {
    const { prisma } = await import('../config/prisma.js');
    const fn = vi.fn().mockResolvedValue({});
    (prisma as unknown as { business: Record<string, unknown> }).business.update = fn;
    return fn;
  };

  it('sem a chave handle devolve 400 e nao grava', async () => {
    const update = await atualizar();
    const response = await request.put('/api/v1/whatsapp/config/instagram').send({});

    expect(response.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('grava usando o businessId do token e normaliza o perfil', async () => {
    const update = await atualizar();
    const response = await request.put('/api/v1/whatsapp/config/instagram').send({ handle: 'minha.barbearia' });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ handle: '@minha.barbearia' });
    expect(update).toHaveBeenCalledWith({ where: { id: 'tenant-1' }, data: { instagramHandle: '@minha.barbearia' } });
  });

  it('perfil invalido devolve 400 com a mensagem', async () => {
    const update = await atualizar();
    const response = await request.put('/api/v1/whatsapp/config/instagram').send({ handle: 'perfil inválido!!' });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toBe('Perfil do Instagram inválido');
    expect(update).not.toHaveBeenCalled();
  });
});

describe('PUT /api/v1/whatsapp/config/menu-reorder', () => {
  const ID1 = '11111111-1111-1111-1111-111111111111';
  const ID2 = '22222222-2222-2222-2222-222222222222';

  it('apaga a linha antiga de avaliacao antes de reordenar, na mesma transacao, e nao a devolve', async () => {
    const { prisma } = await import('../config/prisma.js');
    const chamadas: string[] = [];
    const tx = {
      $queryRaw: vi.fn(async (q: { strings?: string[]; sql?: string }) => {
        const texto = (q.strings ?? [q.sql ?? '']).join(' ');
        chamadas.push(texto);
        if (texto.includes('SELECT')) {
          return [{ id: ID1, handler: 'schedule', option_order: 1 }, { id: ID2, handler: 'promotions', option_order: 2 }];
        }
        return [];
      }),
    };
    vi.mocked(prisma.$transaction).mockImplementationOnce((async (cb: (t: unknown) => unknown) => cb(tx)) as never);

    const response = await request.put('/api/v1/whatsapp/config/menu-reorder').send({ order: [ID1, ID2] });

    expect(response.status).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(chamadas[0]).toContain('DELETE FROM whatsapp_menu_options');
    expect(chamadas[0]).toContain("handler = 'rating'");
    expect(chamadas.slice(1, 5).every((t) => t.includes('UPDATE'))).toBe(true);
    expect(chamadas[chamadas.length - 1]).toContain('SELECT');
    expect(response.body.data.map((o: { handler: string }) => o.handler)).toEqual(['schedule', 'promotions']);
  });
});

describe('GET /api/v1/whatsapp/config/menu', () => {
  it('atualiza o menu antes de ler: menu personalizado perde a linha de avaliacao', async () => {
    const { prisma } = await import('../config/prisma.js');
    const personalizado = [
      { id: 'o1', option_order: 1, handler: 'schedule', label: 'Marcar já', emoji: '📅', type: 'system', active: true },
      { id: 'o5', option_order: 5, handler: 'rating', label: 'Avaliação pós-atendimento', emoji: '⭐', type: 'system', active: true },
      { id: 'o6', option_order: 6, handler: 'promotions', label: 'Promoções', emoji: '🎉', type: 'system', active: true },
    ];
    const sem = personalizado.filter((o) => o.handler !== 'rating');
    const settings = { segment: 'barbearia' };
    (prisma as unknown as { businessSettings: unknown }).businessSettings = { findUnique: vi.fn().mockResolvedValue(settings) };
    const executeTx = vi.fn().mockResolvedValue(1);
    vi.mocked(prisma.$transaction).mockImplementationOnce((async (cb: (t: unknown) => unknown) => cb({ $executeRaw: executeTx })) as never);
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce(personalizado as never) // leitura do garantirMenuAtual
      .mockResolvedValueOnce(sem as never); // leitura da rota
    const response = await request.get('/api/v1/whatsapp/config/menu');
    expect(response.status).toBe(200);
    expect(executeTx).toHaveBeenCalledTimes(1);
    expect(response.body.data.map((o: { handler: string }) => o.handler)).toEqual(['schedule', 'promotions']);
  });
});

describe('POST /api/v1/whatsapp/config/menu/reset', () => {
  it('le o segmento antes e faz o DELETE e os INSERTs na mesma transacao', async () => {
    const { prisma } = await import('../config/prisma.js');
    const ordem: string[] = [];
    (prisma as unknown as { businessSettings: unknown }).businessSettings = {
      findUnique: vi.fn(async () => { ordem.push('segmento'); return { segment: 'estetica' }; }),
    };
    const tx = {
      $queryRaw: vi.fn(async (q: { strings?: string[]; sql?: string }) => {
        const t = (q.strings ?? [q.sql ?? '']).join(' ');
        ordem.push(t.includes('DELETE') ? 'delete' : t.includes('INSERT') ? 'insert' : 'select');
        return [];
      }),
    };
    vi.mocked(prisma.$transaction).mockImplementationOnce((async (cb: (t: unknown) => unknown) => {
      ordem.push('transacao');
      return cb(tx);
    }) as never);
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([{ id: 'x', handler: 'schedule' }] as never);

    const response = await request.post('/api/v1/whatsapp/config/menu/reset');

    expect(response.status).toBe(200);
    expect(ordem.filter((o) => o === 'transacao')).toHaveLength(1);
    expect(ordem.slice(0, 3)).toEqual(['segmento', 'transacao', 'delete']);
    expect(ordem.filter((o) => o === 'insert')).toHaveLength(6);
    expect(ordem.filter((o) => o === 'delete')).toHaveLength(1);
  });

  it('se um INSERT falhar, o erro sobe de dentro da transacao (nada fica pela metade)', async () => {
    const { prisma } = await import('../config/prisma.js');
    (prisma as unknown as { businessSettings: unknown }).businessSettings = { findUnique: vi.fn().mockResolvedValue({ segment: 'barbearia' }) };
    const tx = {
      $queryRaw: vi.fn(async (q: { strings?: string[]; sql?: string }) => {
        if ((q.strings ?? [q.sql ?? '']).join(' ').includes('INSERT')) throw new Error('falhou o insert');
        return [];
      }),
    };
    vi.mocked(prisma.$transaction).mockImplementationOnce((async (cb: (t: unknown) => unknown) => cb(tx)) as never);
    const response = await request.post('/api/v1/whatsapp/config/menu/reset');
    expect(response.status).toBe(500);
    expect(prisma.$queryRaw).not.toHaveBeenCalledWith(expect.objectContaining({ strings: expect.arrayContaining([expect.stringContaining('DELETE')]) }));
  });
});
