import { vi, describe, it, beforeEach, expect } from 'vitest';
import express from 'express';

const subs = vi.hoisted(() => ({ getBusinessBillingContext: vi.fn(), mesclarMetadataCobranca: vi.fn(), setDesiredPlan: vi.fn() }));
const asaas = vi.hoisted(() => ({ atualizarAssinatura: vi.fn() }));
const audit = vi.hoisted(() => ({ logAdminAction: vi.fn(), safeLogFailure: vi.fn() }));
const estado = vi.hoisted(() => ({ invalidar: vi.fn() }));

vi.mock('../config/prisma.js', () => ({ prisma: {} }));
vi.mock('../repositories/subscriptionRepository.js', () => ({ subscriptionRepository: subs }));
vi.mock('../integrations/asaas/service.js', () => ({ asaasService: asaas }));
vi.mock('../services/auditLogService.js', () => ({ auditLogService: audit }));
vi.mock('../modules/conta/estadoConta.service.js', () => ({ estadoContaService: estado }));
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
const url = `/api/v1/admin/subscriptions/${ID}/valor-salao`;
const corpo = { confirmation: 'CONFIRM', valor: 450, reason: 'Rede com 3 unidades' };

beforeEach(() => {
  vi.clearAllMocks();
  subs.getBusinessBillingContext.mockResolvedValue({ id: ID, plan: 'profissional', payment_method: 'pix', metadata: {} });
});

describe('PATCH /admin/subscriptions/:id/valor-salao', () => {
  it('grava o valor combinado, libera o Salão e registra na auditoria', async () => {
    const res = await request.patch(url).send(corpo);
    expect(res.status).toBe(200);
    expect(subs.mesclarMetadataCobranca).toHaveBeenCalledWith(ID, { valorMensalCombinado: 450 });
    expect(subs.setDesiredPlan).toHaveBeenCalledWith(ID, 'premium');
    expect(audit.logAdminAction).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'SALAO_VALUE_SET', targetBusinessId: ID,
      details: expect.objectContaining({ valor: 450, valorAnterior: null, reason: 'Rede com 3 unidades' }),
    }));
    expect(asaas.atualizarAssinatura).not.toHaveBeenCalled();
  });

  it('no Salão com cartão, muda o valor da assinatura no Asaas', async () => {
    subs.getBusinessBillingContext.mockResolvedValue({
      id: ID, plan: 'premium', payment_method: 'card', provider_subscription_id: 'sub_1', metadata: { valorMensalCombinado: 300 },
    });
    expect((await request.patch(url).send(corpo)).status).toBe(200);
    expect(asaas.atualizarAssinatura).toHaveBeenCalledWith('sub_1', { value: 450, updatePendingPayments: true });
  });

  it('recusa valor fora da faixa e sem confirmação', async () => {
    expect((await request.patch(url).send({ ...corpo, valor: 0 })).status).toBe(400);
    expect((await request.patch(url).send({ ...corpo, valor: 100000 })).status).toBe(400);
    expect((await request.patch(url).send({ valor: 450, reason: 'x x x' })).status).toBe(400);
    expect(subs.mesclarMetadataCobranca).not.toHaveBeenCalled();
  });

  it('negócio inexistente → 404', async () => {
    subs.getBusinessBillingContext.mockResolvedValue(null);
    expect((await request.patch(url).send(corpo)).status).toBe(404);
  });
});
