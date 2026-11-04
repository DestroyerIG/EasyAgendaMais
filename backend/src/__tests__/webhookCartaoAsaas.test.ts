import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const repo = vi.hoisted(() => ({
  hasProcessedBillingWebhookEvent: vi.fn(),
  getBusinessBillingContext: vi.fn(),
  findByProviderPaymentId: vi.fn(),
  findBillingPaymentByProviderPaymentId: vi.fn(),
  findByProviderSubscriptionId: vi.fn(),
  findByCheckoutCartao: vi.fn(),
  updateSubscriptionState: vi.fn(),
  upsertBillingPayment: vi.fn(),
  storeBillingWebhookEvent: vi.fn(),
  mesclarMetadataCobranca: vi.fn(),
  ligarCartaoNoTeste: vi.fn(),
}));
const asaas = vi.hoisted(() => ({
  resolveBillingPeriodFromPayment: vi.fn((p: { confirmedDate?: string | null }) => {
    if (!p?.confirmedDate) return { periodStart: null, periodEnd: null };
    const ini = new Date(`${p.confirmedDate}T12:00:00Z`);
    const fim = new Date(ini); fim.setUTCMonth(fim.getUTCMonth() + 1);
    return { periodStart: ini, periodEnd: fim };
  }),
  buscarAssinatura: vi.fn(),
  atualizarCobranca: vi.fn(),
}));

vi.mock('../repositories/subscriptionRepository.js', () => ({ subscriptionRepository: repo }));
vi.mock('../integrations/asaas/service.js', () => ({ asaasService: asaas }));
vi.mock('../modules/conta/estadoConta.service.js', () => ({ estadoContaService: { invalidar: vi.fn() } }));
vi.mock('../modules/billing/planChange.service.js', () => ({ planChangeService: { webhookUpgradePix: vi.fn() } }));
vi.mock('../utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../config/prisma.js', () => ({ prisma: { $queryRaw: vi.fn().mockResolvedValue([]) } }));

const { billingService } = await import('../services/billingService.js');

const ID = '11111111-1111-4111-8111-111111111111';
const headers = { 'asaas-access-token': 'segredo' };
const negocio = (extra: Record<string, unknown> = {}) => ({
  id: ID, plan: 'profissional', subscription_status: 'trialing',
  created_at: new Date('2026-11-01T15:00:00Z'),
  subscription_current_period_end: new Date('2026-11-08T15:00:00Z'),
  provider: null, payment_method: null, provider_subscription_id: null, provider_customer_id: null,
  metadata: { checkoutCartao: { id: 'chk-1', plano: 'basico' } },
  ...extra,
});
const cobranca = (extra: Record<string, unknown> = {}) => ({
  id: 'pay_1', customer: 'cus_9', subscription: 'sub_1', checkoutSession: 'chk-1',
  billingType: 'CREDIT_CARD', status: 'PENDING', value: 49.9, dueDate: '2026-11-15',
  externalReference: null, confirmedDate: null,
  ...extra,
});
const evento = (event: string, payment: Record<string, unknown>, id = `evt_${event}_${payment.id}`) => ({ id, event, payment });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ASAAS_WEBHOOK_TOKEN = 'segredo';
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-03T12:00:00-03:00'));
  repo.hasProcessedBillingWebhookEvent.mockResolvedValue(false);
  repo.findByProviderPaymentId.mockResolvedValue(null);
  repo.findBillingPaymentByProviderPaymentId.mockResolvedValue(null);
  repo.findByProviderSubscriptionId.mockResolvedValue(null);
  repo.findByCheckoutCartao.mockResolvedValue(negocio());
  asaas.buscarAssinatura.mockResolvedValue({ id: 'sub_1', creditCard: { creditCardNumber: '4444', creditCardBrand: 'VISA', creditCardToken: 'tok_1' } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('webhook do Asaas no cartão', () => {
  it('primeira cobrança de cartão no teste liga o cartão e estende o teste até o vencimento', async () => {
    await billingService.handleAsaasWebhook(evento('PAYMENT_CREATED', cobranca()), headers);
    expect(repo.findByCheckoutCartao).toHaveBeenCalledWith('chk-1', null);
    expect(repo.ligarCartaoNoTeste).toHaveBeenCalledWith(ID, {
      subscriptionId: 'sub_1', customerId: 'cus_9', fimDoTeste: new Date('2026-11-15T12:00:00Z'),
    });
    expect(repo.mesclarMetadataCobranca).toHaveBeenCalledWith(ID, expect.objectContaining({
      cartao: { token: 'tok_1', bandeira: 'VISA', final: '4444' },
    }));
    // No teste, a cobrança pendente não muda o status: continua trialing.
    expect(repo.updateSubscriptionState).not.toHaveBeenCalled();
    expect(repo.upsertBillingPayment).toHaveBeenCalledWith(expect.objectContaining({ paymentMethod: 'card', providerPaymentId: 'pay_1' }), null);
  });

  it('cobrança de cartão confirmada no fim do teste ativa o plano escolhido', async () => {
    repo.findByProviderSubscriptionId.mockResolvedValue(negocio({ provider: 'asaas', payment_method: 'card', provider_subscription_id: 'sub_1' }));
    await billingService.handleAsaasWebhook(
      evento('PAYMENT_CONFIRMED', cobranca({ status: 'CONFIRMED', confirmedDate: '2026-11-15' })), headers,
    );
    expect(repo.updateSubscriptionState).toHaveBeenCalledWith(ID, expect.objectContaining({
      plan: 'basico', subscriptionStatus: 'active', paymentMethod: 'card', provider: 'asaas',
      currentPeriodStart: new Date('2026-11-15T12:00:00Z'),
    }), null);
    expect(repo.upsertBillingPayment).toHaveBeenCalledWith(expect.objectContaining({ paymentMethod: 'card' }), null);
  });

  it('desconto do cupom só na primeira cobrança', async () => {
    repo.findByCheckoutCartao.mockResolvedValue(negocio({
      metadata: { checkoutCartao: { id: 'chk-1', plano: 'basico' }, descontoPrimeiraMensalidade: { valor: 4.99, cupom: 'DEZ' } },
    }));
    await billingService.handleAsaasWebhook(evento('PAYMENT_CREATED', cobranca()), headers);
    expect(asaas.atualizarCobranca).toHaveBeenCalledWith('pay_1', { value: 44.91 });
    expect(repo.mesclarMetadataCobranca).toHaveBeenCalledWith(ID, expect.objectContaining({ descontoPrimeiraMensalidade: null }));

    vi.clearAllMocks();
    repo.hasProcessedBillingWebhookEvent.mockResolvedValue(false);
    repo.findByProviderSubscriptionId.mockResolvedValue(negocio({
      subscription_status: 'active', provider: 'asaas', payment_method: 'card', provider_subscription_id: 'sub_1',
      metadata: { checkoutCartao: { id: 'chk-1', plano: 'basico' }, descontoPrimeiraMensalidade: null },
    }));
    await billingService.handleAsaasWebhook(evento('PAYMENT_CREATED', cobranca({ id: 'pay_2', dueDate: '2026-12-15' })), headers);
    expect(asaas.atualizarCobranca).not.toHaveBeenCalled();
  });

  it('cobrança de cartão antes de o negócio ter a assinatura gravada é achada pelo checkout', async () => {
    repo.findByCheckoutCartao.mockResolvedValue(negocio({ subscription_status: 'incomplete' }));
    await billingService.handleAsaasWebhook(
      evento('PAYMENT_CONFIRMED', cobranca({ status: 'CONFIRMED', confirmedDate: '2026-11-03' })), headers,
    );
    expect(repo.findByCheckoutCartao).toHaveBeenCalledWith('chk-1', null);
    expect(repo.updateSubscriptionState).toHaveBeenCalledWith(ID, expect.objectContaining({
      providerSubscriptionId: 'sub_1', subscriptionStatus: 'active', plan: 'basico',
    }), null);
  });

  it('primeira cobrança recusada no fim do teste vai para a contingência', async () => {
    repo.findByProviderSubscriptionId.mockResolvedValue(negocio({ provider: 'asaas', payment_method: 'card', provider_subscription_id: 'sub_1' }));
    await billingService.handleAsaasWebhook(evento('PAYMENT_OVERDUE', cobranca({ status: 'OVERDUE' })), headers);
    expect(repo.updateSubscriptionState).toHaveBeenCalledWith(ID, expect.objectContaining({ subscriptionStatus: 'past_due' }), null);
  });

  it('evento repetido é ignorado', async () => {
    repo.hasProcessedBillingWebhookEvent.mockResolvedValue(true);
    const r = await billingService.handleAsaasWebhook(evento('PAYMENT_CREATED', cobranca()), headers);
    expect(r).toMatchObject({ duplicate: true });
    expect(repo.ligarCartaoNoTeste).not.toHaveBeenCalled();
  });

  it('cobrança de Pix continua gravada como Pix', async () => {
    repo.findByCheckoutCartao.mockResolvedValue(null);
    repo.getBusinessBillingContext.mockResolvedValue(negocio({ subscription_status: 'pending', metadata: {} }));
    await billingService.handleAsaasWebhook(evento('PAYMENT_RECEIVED', cobranca({
      id: 'pay_pix', billingType: 'PIX', subscription: null, checkoutSession: null, status: 'RECEIVED',
      confirmedDate: '2026-11-03', externalReference: `business:${ID}:plan:basico`,
    })), headers);
    expect(repo.updateSubscriptionState).toHaveBeenCalledWith(ID, expect.objectContaining({ paymentMethod: 'pix', subscriptionStatus: 'active' }), null);
    expect(repo.ligarCartaoNoTeste).not.toHaveBeenCalled();
  });
});
