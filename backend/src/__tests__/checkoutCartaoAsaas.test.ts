import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const repo = vi.hoisted(() => ({
  getBusinessBillingContext: vi.fn(),
  setDesiredPlan: vi.fn(),
  updateSubscriptionState: vi.fn(),
  mesclarMetadataCobranca: vi.fn(),
}));
const asaas = vi.hoisted(() => ({ criarCheckoutCartao: vi.fn() }));
const cupons = vi.hoisted(() => ({ validate: vi.fn(), validateAndApply: vi.fn(), reserve: vi.fn(), release: vi.fn() }));

vi.mock('../repositories/subscriptionRepository.js', () => ({ subscriptionRepository: repo }));
vi.mock('../integrations/asaas/service.js', () => ({ asaasService: asaas }));
vi.mock('../services/couponService.js', () => ({ couponService: cupons }));
vi.mock('../utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const { billingService } = await import('../services/billingService.js');
const { billingProviderFactory } = await import('../services/billing/billingProviderFactory.js');

const negocio = (extra: Record<string, unknown> = {}) => ({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Studio', email: 'a@b.c', plan: 'profissional', desired_plan: 'basico',
  created_at: new Date('2026-11-01T15:00:00Z'),
  subscription_status: 'trialing',
  subscription_current_period_end: new Date('2026-11-08T15:00:00Z'),
  subscription_cancel_at_period_end: false,
  ...extra,
});

const semCupom = { finalAmount: 49.9, discount: 0, coupon: null };
const dataDoCheckout = () => {
  const d = asaas.criarCheckoutCartao.mock.calls[0][0].nextDueDate as Date;
  return d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-03T12:00:00-03:00'));
  asaas.criarCheckoutCartao.mockResolvedValue({ checkoutId: 'chk-1', url: 'https://asaas.test/checkout/chk-1' });
  cupons.validate.mockResolvedValue(semCupom);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('checkout do cartão pelo Asaas', () => {
  it('cartão no teste cobra no fim do teste', async () => {
    repo.getBusinessBillingContext.mockResolvedValue(negocio());
    const r = await billingService.createCheckoutSession(negocio().id, 'basico', 'card');
    expect(dataDoCheckout()).toBe('2026-11-15');
    expect(asaas.criarCheckoutCartao.mock.calls[0][0]).toMatchObject({ plan: 'basico', valor: 49.9 });
    expect(r).toMatchObject({ provider: 'asaas', formaPagamento: 'card', checkoutUrl: 'https://asaas.test/checkout/chk-1', plan: 'basico' });
    expect(String(r.cobrancaEm).slice(0, 10)).toBe('2026-11-15');
    expect(repo.mesclarMetadataCobranca).toHaveBeenCalledWith(negocio().id, expect.objectContaining({
      checkoutCartao: expect.objectContaining({ id: 'chk-1', plano: 'basico' }),
    }));
  });

  it('cartão depois do teste cobra hoje', async () => {
    vi.setSystemTime(new Date('2026-11-10T12:00:00-03:00'));
    repo.getBusinessBillingContext.mockResolvedValue(negocio());
    await billingService.createCheckoutSession(negocio().id, 'basico', 'card');
    expect(dataDoCheckout()).toBe('2026-11-10');
  });

  it('conta sem teste cobra hoje', async () => {
    repo.getBusinessBillingContext.mockResolvedValue(negocio({ subscription_status: 'incomplete' }));
    await billingService.createCheckoutSession(negocio().id, 'basico', 'card');
    expect(dataDoCheckout()).toBe('2026-11-03');
  });

  it('teste estendido não encurta', async () => {
    repo.getBusinessBillingContext.mockResolvedValue(negocio({ subscription_current_period_end: new Date('2026-11-20T15:00:00Z') }));
    await billingService.createCheckoutSession(negocio().id, 'basico', 'card');
    expect(dataDoCheckout()).toBe('2026-11-20');
  });

  it('cancelou no teste e cadastra de novo: cobra no fim do teste, nunca hoje', async () => {
    repo.getBusinessBillingContext.mockResolvedValue(negocio({
      subscription_cancel_at_period_end: true,
      subscription_current_period_end: new Date('2026-11-15T15:00:00Z'),
    }));
    await billingService.createCheckoutSession(negocio().id, 'basico', 'card');
    expect(dataDoCheckout()).toBe('2026-11-15');
  });

  it('cupom no cartão: valor cheio na assinatura e desconto guardado para a primeira mensalidade', async () => {
    repo.getBusinessBillingContext.mockResolvedValue(negocio());
    cupons.validate.mockResolvedValue({ finalAmount: 44.91, discount: 4.99, coupon: { id: 'c1', code: 'DEZ' } });
    await billingService.createCheckoutSession(negocio().id, 'basico', 'card', 'DEZ');
    expect(asaas.criarCheckoutCartao.mock.calls[0][0].valor).toBe(49.9);
    expect(repo.mesclarMetadataCobranca).toHaveBeenCalledWith(negocio().id, expect.objectContaining({
      descontoPrimeiraMensalidade: { valor: 4.99, cupom: 'DEZ' },
    }));
  });

  it('cupom de 100% no cartão ativa sem checkout', async () => {
    repo.getBusinessBillingContext.mockResolvedValue(negocio());
    cupons.validate.mockResolvedValue({ finalAmount: 0, discount: 49.9, coupon: { id: 'c1', code: 'TUDO' } });
    const r = await billingService.createCheckoutSession(negocio().id, 'basico', 'card', 'TUDO');
    expect(r).toMatchObject({ type: 'FREE_ACTIVATION', activated: true });
    expect(asaas.criarCheckoutCartao).not.toHaveBeenCalled();
  });

  it('card não vai mais para o Stripe', () => {
    expect(billingProviderFactory.resolveProviderByPaymentMethod('card')).toBe('asaas');
    expect(billingProviderFactory.resolveProviderByPaymentMethod('pix')).toBe('asaas');
    expect(() => billingProviderFactory.resolveProviderByPaymentMethod('boleto')).toThrow(/inválido/);
  });
});
