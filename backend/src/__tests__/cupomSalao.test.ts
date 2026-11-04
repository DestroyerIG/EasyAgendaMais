import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const subs = vi.hoisted(() => ({ getBusinessBillingContext: vi.fn() }));
const cupons = vi.hoisted(() => ({ validate: vi.fn() }));
vi.mock('../repositories/subscriptionRepository.js', () => ({ subscriptionRepository: subs }));
vi.mock('../services/couponService.js', () => ({ couponService: cupons }));
vi.mock('../config/prisma.js', () => ({ prisma: { $queryRaw: vi.fn().mockResolvedValue([]) } }));
vi.mock('../utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const { validateCoupon } = await import('../modules/billing/billing.controller.js');

const chamar = async (plan: string, businessId = 'b1') => {
  const res = { json: vi.fn() } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;
  await validateCoupon({ body: { code: 'DEZ', plan }, user: { businessId } } as unknown as Request, res, next);
  return { json: (res.json as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0], erro: (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] };
};

beforeEach(() => {
  vi.clearAllMocks();
  cupons.validate.mockImplementation(async (_c: string, base: number) => ({ finalAmount: Number((base * 0.9).toFixed(2)) }));
});

describe('prévia do cupom no Salão', () => {
  it('usa o valor combinado do negócio', async () => {
    subs.getBusinessBillingContext.mockResolvedValue({ id: 'b1', plan: 'profissional', metadata: { valorMensalCombinado: 450 } });
    const { json } = await chamar('premium');
    expect(json).toMatchObject({ originalAmount: 450, finalAmount: 405 });
  });

  it('sem valor combinado, responde sob consulta', async () => {
    subs.getBusinessBillingContext.mockResolvedValue({ id: 'b1', plan: 'profissional', metadata: {} });
    const { erro } = await chamar('premium');
    expect(erro).toMatchObject({ code: 'SALAO_SOB_CONSULTA' });
  });

  it('Solo e Equipe seguem com o preço do catálogo', async () => {
    subs.getBusinessBillingContext.mockResolvedValue({ id: 'b1', plan: 'profissional', metadata: {} });
    const { json } = await chamar('basico');
    expect(json).toMatchObject({ originalAmount: 49.9 });
  });
});
