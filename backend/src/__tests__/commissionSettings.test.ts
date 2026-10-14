import { describe, it, expect, vi, beforeEach } from 'vitest';

const prismaMock = vi.hoisted(() => ({ businessSettings: { findUnique: vi.fn(), upsert: vi.fn() } }));
vi.mock('../config/prisma.js', () => ({ prisma: prismaMock }));

const { commissionSettings, resolveCommission } = await import('../modules/comandas/commissionSettings.js');

describe('commissionSettings', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sem configuração salva devolve 0% e 0%', async () => {
    prismaMock.businessSettings.findUnique.mockResolvedValue(null);
    await expect(commissionSettings.get('b1')).resolves.toEqual({ serviceCommissionPct: 0, productCommissionPct: 0 });
  });

  it('converte Decimal para número', async () => {
    prismaMock.businessSettings.findUnique.mockResolvedValue({ commissionServicePct: '50.00', commissionProductPct: '20.00' });
    await expect(commissionSettings.get('b1')).resolves.toEqual({ serviceCommissionPct: 50, productCommissionPct: 20 });
  });

  it('salva com upsert por negócio', async () => {
    prismaMock.businessSettings.upsert.mockResolvedValue({ commissionServicePct: 40, commissionProductPct: 10 });
    await commissionSettings.update('b1', { serviceCommissionPct: 40, productCommissionPct: 10 });
    expect(prismaMock.businessSettings.upsert).toHaveBeenCalledWith({
      where: { businessId: 'b1' },
      create: { businessId: 'b1', commissionServicePct: 40, commissionProductPct: 10 },
      update: { commissionServicePct: 40, commissionProductPct: 10 },
      select: { commissionServicePct: true, commissionProductPct: true },
    });
  });
});

describe('resolveCommission', () => {
  const negocio = { serviceCommissionPct: 50, productCommissionPct: 20 };

  it('usa o padrão do negócio quando a profissional não tem regra própria', () => {
    expect(resolveCommission({ commissionServicePct: null, commissionProductPct: null }, negocio))
      .toEqual({ servicePct: 50, productPct: 20, origem: 'negocio' });
  });

  it('percentual próprio substitui só o campo preenchido', () => {
    expect(resolveCommission({ commissionServicePct: '60', commissionProductPct: null }, negocio))
      .toEqual({ servicePct: 60, productPct: 20, origem: 'profissional' });
  });

  it('zero próprio é regra válida (não cai no padrão)', () => {
    expect(resolveCommission({ commissionServicePct: 0, commissionProductPct: 0 }, negocio))
      .toEqual({ servicePct: 0, productPct: 0, origem: 'profissional' });
  });
});
