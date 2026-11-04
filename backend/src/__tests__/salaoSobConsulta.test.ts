import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const subs = vi.hoisted(() => ({
  getBusinessBillingContext: vi.fn(),
  getSubscriptionStatus: vi.fn(),
  setDesiredPlan: vi.fn(),
  updateSubscriptionState: vi.fn(),
  mesclarMetadataCobranca: vi.fn(),
  upsertBillingPayment: vi.fn(),
  setAsaasCustomerId: vi.fn(),
}));
const asaas = vi.hoisted(() => ({
  criarCheckoutCartao: vi.fn(),
  createPixCharge: vi.fn(),
  criarCobrancaCartao: vi.fn(),
  getPaymentWithPixData: vi.fn(),
  getOrCreateAsaasCustomer: vi.fn(),
  atualizarAssinatura: vi.fn(),
  cancelSubscription: vi.fn(),
}));
const repoTroca = vi.hoisted(() => ({
  upgradePendente: vi.fn(),
  contarProfissionaisAtivas: vi.fn(),
  agendarPlano: vi.fn(),
  aplicarPlano: vi.fn(),
}));
const cupons = vi.hoisted(() => ({ validate: vi.fn(), validateAndApply: vi.fn() }));

vi.mock('../repositories/subscriptionRepository.js', () => ({ subscriptionRepository: subs }));
vi.mock('../integrations/asaas/service.js', () => ({ asaasService: asaas }));
vi.mock('../integrations/asaas/client.js', () => ({ asaasClient: { delete: vi.fn() } }));
vi.mock('../modules/billing/planChange.repository.js', () => ({ planChangeRepository: repoTroca }));
vi.mock('../services/couponService.js', () => ({ couponService: cupons }));
vi.mock('../modules/conta/estadoConta.service.js', () => ({ estadoContaService: { invalidar: vi.fn() } }));
vi.mock('../utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../config/prisma.js', () => ({ prisma: { $queryRaw: vi.fn().mockResolvedValue([]) } }));

const { valorMensal, VALOR_SALAO_LEGADO } = await import('../config/valorPlano.js');
const { getPlanCatalog } = await import('../config/planCatalog.js');
const { billingService } = await import('../services/billingService.js');
const { planChangeService } = await import('../modules/billing/planChange.service.js');

const ID = '11111111-1111-4111-8111-111111111111';
const DIA = 86_400_000;
const negocio = (extra: Record<string, unknown> = {}) => ({
  id: ID, name: 'Rede Bela', plan: 'profissional', desired_plan: 'premium', subscription_status: 'active',
  provider: 'asaas', payment_method: 'pix', provider_customer_id: 'cus_1', provider_subscription_id: null,
  created_at: new Date('2026-09-01T15:00:00Z'),
  current_period_start: new Date(Date.now() - 15 * DIA), current_period_end: new Date(Date.now() + 15 * DIA),
  metadata: {},
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  cupons.validate.mockImplementation(async (_c: string, base: number) => ({ finalAmount: base, discount: 0, coupon: null }));
  repoTroca.upgradePendente.mockResolvedValue(null);
  repoTroca.contarProfissionaisAtivas.mockResolvedValue(1);
  asaas.criarCheckoutCartao.mockResolvedValue({ checkoutId: 'chk-1', url: 'https://asaas/c/1' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('catálogo e valor mensal', () => {
  it('o Salão é sob consulta no catálogo', () => {
    const salao = getPlanCatalog().planos.find((p) => p.id === 'premium')!;
    expect(salao.preco).toBeNull();
    expect(salao.sobConsulta).toBe(true);
    expect(getPlanCatalog().planos.find((p) => p.id === 'basico')!).toMatchObject({ preco: 49.9, sobConsulta: false });
  });

  it('valorMensal: catálogo no Solo e Equipe, combinado no Salão, legado para quem já está no Salão', () => {
    expect(valorMensal({ plan: 'basico' }, 'profissional')).toBe(99.9);
    expect(valorMensal({ plan: 'profissional', metadata: { valorMensalCombinado: 450 } }, 'premium')).toBe(450);
    expect(valorMensal({ plan: 'profissional', metadata: {} }, 'premium')).toBeNull();
    expect(valorMensal({ plan: 'premium', metadata: {} }, 'premium')).toBe(VALOR_SALAO_LEGADO);
    expect(VALOR_SALAO_LEGADO).toBe(199.9);
  });
});

describe('checkout do Salão', () => {
  it('sem valor combinado, recusa com SALAO_SOB_CONSULTA', async () => {
    subs.getBusinessBillingContext.mockResolvedValue(negocio({ subscription_status: 'trialing' }));
    await expect(billingService.createCheckoutSession(ID, 'premium', 'pix')).rejects.toMatchObject({
      statusCode: 409, code: 'SALAO_SOB_CONSULTA',
    });
    expect(asaas.createPixCharge).not.toHaveBeenCalled();
  });

  it('com valor combinado, o cartão usa esse valor', async () => {
    subs.getBusinessBillingContext.mockResolvedValue(negocio({ subscription_status: 'incomplete', metadata: { valorMensalCombinado: 450 } }));
    await billingService.createCheckoutSession(ID, 'premium', 'card');
    expect(asaas.criarCheckoutCartao).toHaveBeenCalledWith(expect.objectContaining({ plan: 'premium', valor: 450 }));
  });
});

describe('troca de plano para o Salão', () => {
  it('sem valor combinado, a prévia recusa com SALAO_SOB_CONSULTA', async () => {
    subs.getBusinessBillingContext.mockResolvedValue(negocio());
    await expect(planChangeService.previa(ID, 'premium')).rejects.toMatchObject({ code: 'SALAO_SOB_CONSULTA' });
  });

  it('com valor combinado, o proporcional e o valor mensal novo usam o combinado', async () => {
    subs.getBusinessBillingContext.mockResolvedValue(negocio({ metadata: { valorMensalCombinado: 399.9 } }));
    const previa = await planChangeService.previa(ID, 'premium');
    expect(previa.valorMensalNovo).toBe(399.9);
    // 30 dias de ciclo, 15 restantes: (399,90 - 99,90) * 15/30 = 150,00
    expect(previa.valorHoje).toBe(150);
  });

  it('downgrade do Salão para o Equipe sobe o valor do catálogo do Equipe', async () => {
    subs.getBusinessBillingContext.mockResolvedValue(negocio({
      plan: 'premium', payment_method: 'card', provider_subscription_id: 'sub_1', metadata: { valorMensalCombinado: 450 },
    }));
    await planChangeService.trocar(ID, 'profissional');
    expect(asaas.atualizarAssinatura).toHaveBeenCalledWith('sub_1', { value: 99.9, updatePendingPayments: true });
  });
});

describe('status', () => {
  it('devolve o valor combinado do Salão', async () => {
    subs.getSubscriptionStatus.mockResolvedValue({ plan: 'profissional', subscription_status: 'active', metadata: { valorMensalCombinado: 450 } });
    expect((await billingService.getStatus(ID)).valorSalao).toBe(450);
  });

  it('quem já está no Salão sem valor combinado vê o legado', async () => {
    subs.getSubscriptionStatus.mockResolvedValue({ plan: 'premium', subscription_status: 'active', metadata: {} });
    expect((await billingService.getStatus(ID)).valorSalao).toBe(199.9);
  });

  it('não devolve o metadata (token do cartão, checkouts) para o navegador', async () => {
    subs.getSubscriptionStatus.mockResolvedValue({
      plan: 'premium', subscription_status: 'active',
      metadata: { valorMensalCombinado: 450, cartao: { token: 'tok_secreto' }, checkoutCartao: { id: 'chk-1' } },
    });
    const status = await billingService.getStatus(ID);
    expect(status).not.toHaveProperty('metadata');
    expect(JSON.stringify(status)).not.toContain('tok_secreto');
    expect(status.valorSalao).toBe(450);
  });

  it('sem valor combinado, valorSalao é null', async () => {
    subs.getSubscriptionStatus.mockResolvedValue({ plan: 'profissional', subscription_status: 'active', metadata: {} });
    expect((await billingService.getStatus(ID)).valorSalao).toBeNull();
  });
});
