import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Sequências reais de eventos do Asaas no cartão (revisão final da branch Asaas único).
const repo = vi.hoisted(() => ({
  hasProcessedBillingWebhookEvent: vi.fn(),
  getBusinessBillingContext: vi.fn(),
  findByProviderPaymentId: vi.fn(),
  findBillingPaymentByProviderPaymentId: vi.fn(),
  findByProviderSubscriptionId: vi.fn(),
  findByCheckoutCartao: vi.fn(),
  findByProviderCustomerId: vi.fn(),
  updateSubscriptionState: vi.fn(),
  upsertBillingPayment: vi.fn(),
  storeBillingWebhookEvent: vi.fn(),
  mesclarMetadataCobranca: vi.fn(),
  ligarCartaoNoTeste: vi.fn(),
  cobrancaPendenteCartao: vi.fn(),
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
  atualizarAssinatura: vi.fn(),
  cancelSubscription: vi.fn(),
  criarCheckoutCartao: vi.fn(),
  criarAssinaturaComToken: vi.fn(),
  getPaymentWithPixData: vi.fn(),
}));
const cupons = vi.hoisted(() => ({ validate: vi.fn(), validateAndApply: vi.fn() }));

vi.mock('../repositories/subscriptionRepository.js', () => ({ subscriptionRepository: repo }));
vi.mock('../integrations/asaas/service.js', () => ({ asaasService: asaas }));
vi.mock('../services/couponService.js', () => ({ couponService: cupons }));
vi.mock('../modules/conta/estadoConta.service.js', () => ({ estadoContaService: { invalidar: vi.fn() } }));
vi.mock('../modules/billing/planChange.service.js', () => ({ planChangeService: { webhookUpgradePix: vi.fn() } }));
vi.mock('../utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../config/prisma.js', () => ({ prisma: { $queryRaw: vi.fn().mockResolvedValue([]) } }));

const { billingService } = await import('../services/billingService.js');
const { calcularEstadoConta } = await import('../modules/conta/estadoConta.rules.js');

const ID = '11111111-1111-4111-8111-111111111111';
const headers = { 'asaas-access-token': 'segredo' };
const cartaoAtivo = (extra: Record<string, unknown> = {}) => ({
  id: ID, plan: 'basico', subscription_status: 'active', provider: 'asaas', payment_method: 'card',
  provider_subscription_id: 'sub_1', provider_customer_id: 'cus_9', subscription_cancel_at_period_end: false,
  created_at: new Date('2026-09-01T15:00:00Z'),
  current_period_end: new Date('2026-11-15T12:00:00Z'), subscription_current_period_end: new Date('2026-11-15T12:00:00Z'),
  next_due_date: new Date('2026-10-15T12:00:00Z'),
  metadata: { checkoutCartao: { id: 'chk-1', plano: 'basico' }, cartao: { token: 'tok_1', bandeira: 'VISA', final: '4444' } },
  ...extra,
});
const cobranca = (extra: Record<string, unknown> = {}) => ({
  id: 'pay_1', customer: 'cus_9', subscription: 'sub_1', checkoutSession: null, billingType: 'CREDIT_CARD',
  status: 'CONFIRMED', value: 49.9, dueDate: '2026-10-15', confirmedDate: '2026-10-15', externalReference: null,
  ...extra,
});
const evento = (event: string, payment: Record<string, unknown>) => ({ id: `evt_${event}_${payment.id}_${payment.status}`, event, payment });
const webhook = (event: string, payment: Record<string, unknown>) => billingService.handleAsaasWebhook(evento(event, payment), headers);
// O webhook acha o negócio pela assinatura ou pelo registro da cobrança: os dois devolvem o mesmo negócio.
const usar = (negocio: Record<string, unknown> | null) => {
  repo.findByProviderSubscriptionId.mockResolvedValue(negocio);
  repo.getBusinessBillingContext.mockResolvedValue(negocio);
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ASAAS_WEBHOOK_TOKEN = 'segredo';
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-03T12:00:00-03:00'));
  repo.hasProcessedBillingWebhookEvent.mockResolvedValue(false);
  repo.findByProviderPaymentId.mockResolvedValue(null);
  repo.findBillingPaymentByProviderPaymentId.mockResolvedValue(null);
  repo.findByCheckoutCartao.mockResolvedValue(null);
  usar(cartaoAtivo());
  asaas.buscarAssinatura.mockResolvedValue({ id: 'sub_1', creditCard: { creditCardToken: 'tok_1' } });
  cupons.validate.mockResolvedValue({ finalAmount: 49.9, discount: 0, coupon: null });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('C1: cobrança apagada não derruba a conta', () => {
  it('PAYMENT_DELETED depois de cancelar no teste com cartão não marca canceled', async () => {
    usar(cartaoAtivo({ subscription_status: 'trialing', subscription_cancel_at_period_end: true }));
    await webhook('PAYMENT_DELETED', cobranca({ status: 'PENDING', dueDate: '2026-11-15', confirmedDate: null, deleted: true }));
    expect(repo.updateSubscriptionState).not.toHaveBeenCalled();
    // Nem religa o cartão no teste (isso zeraria o cancelamento).
    expect(repo.ligarCartaoNoTeste).not.toHaveBeenCalled();
  });
});

describe('C2: confirmação atrasada de cobrança antiga', () => {
  it('PAYMENT_RECEIVED de cobrança já paga não desfaz o cancelamento nem muda o período', async () => {
    usar(cartaoAtivo({ subscription_cancel_at_period_end: true }));
    repo.findBillingPaymentByProviderPaymentId.mockResolvedValue({ business_id: ID, paid_at: new Date('2026-10-15T12:00:00Z') });
    await webhook('PAYMENT_RECEIVED', cobranca({ status: 'RECEIVED' }));
    expect(repo.updateSubscriptionState).not.toHaveBeenCalled();
  });

  it('pagamento de um mês anterior não libera a conta com a cobrança atual vencida', async () => {
    usar(cartaoAtivo({ subscription_status: 'past_due', next_due_date: new Date('2026-11-15T12:00:00Z') }));
    await webhook('PAYMENT_RECEIVED', cobranca({ status: 'RECEIVED', dueDate: '2026-10-15' }));
    expect(repo.updateSubscriptionState).not.toHaveBeenCalled();
  });

  it('cobrança paga nova no cartão não zera o cancelamento agendado', async () => {
    usar(cartaoAtivo({ subscription_cancel_at_period_end: true }));
    await webhook('PAYMENT_CONFIRMED', cobranca({ id: 'pay_2', dueDate: '2026-11-15', confirmedDate: '2026-11-15' }));
    const estado = repo.updateSubscriptionState.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(estado.cancelAtPeriodEnd).toBeUndefined();
  });

  it('cobrança do próximo ciclo gerada antes do vencimento não tira a conta de active', async () => {
    await webhook('PAYMENT_CREATED', cobranca({ id: 'pay_2', status: 'PENDING', dueDate: '2026-11-15', confirmedDate: null }));
    expect(repo.updateSubscriptionState).not.toHaveBeenCalled();
    expect(repo.upsertBillingPayment).toHaveBeenCalledWith(expect.objectContaining({ providerPaymentId: 'pay_2', paymentMethod: 'card' }), null);
  });
});

describe('C4: renovação mantém o plano atual', () => {
  it('depois de um upgrade, a renovação não volta ao plano do checkout', async () => {
    usar(cartaoAtivo({ plan: 'premium' }));
    await webhook('PAYMENT_CONFIRMED', cobranca({ id: 'pay_2', dueDate: '2026-11-15', confirmedDate: '2026-11-15', value: 199.9 }));
    expect(repo.updateSubscriptionState).toHaveBeenCalledWith(ID, expect.objectContaining({ plan: 'premium' }), null);
  });

  it('a primeira cobrança do checkout ainda usa o plano escolhido', async () => {
    repo.findByProviderSubscriptionId.mockResolvedValue(null);
    repo.findByCheckoutCartao.mockResolvedValue(cartaoAtivo({
      subscription_status: 'incomplete', plan: 'profissional', provider_subscription_id: null,
    }));
    await webhook('PAYMENT_CONFIRMED', cobranca({ checkoutSession: 'chk-1', dueDate: '2026-11-03', confirmedDate: '2026-11-03' }));
    expect(repo.updateSubscriptionState).toHaveBeenCalledWith(ID, expect.objectContaining({ plan: 'basico' }), null);
  });

  it('no teste, a primeira cobrança da assinatura recriada usa o plano escolhido, não o Equipe do teste', async () => {
    usar(cartaoAtivo({ subscription_status: 'trialing', plan: 'profissional' }));
    await webhook('PAYMENT_CONFIRMED', cobranca({ id: 'pay_3', dueDate: '2026-11-15', confirmedDate: '2026-11-15' }));
    expect(repo.updateSubscriptionState).toHaveBeenCalledWith(ID, expect.objectContaining({ plan: 'basico' }), null);
  });
});

describe('C3: nunca duas assinaturas de cartão', () => {
  it('novo checkout de cartão remove a assinatura de cartão anterior no Asaas', async () => {
    repo.getBusinessBillingContext.mockResolvedValue(cartaoAtivo({ subscription_status: 'past_due' }));
    asaas.criarCheckoutCartao.mockResolvedValue({ checkoutId: 'chk-2', url: 'https://asaas/c/2' });
    await billingService.createCheckoutSession(ID, 'basico', 'card');
    expect(asaas.cancelSubscription).toHaveBeenCalledWith('sub_1');
    expect(asaas.cancelSubscription.mock.invocationCallOrder[0]).toBeLessThan(asaas.criarCheckoutCartao.mock.invocationCallOrder[0]);
  });

  it('os checkouts anteriores continuam achando o negócio', async () => {
    repo.getBusinessBillingContext.mockResolvedValue(cartaoAtivo({ subscription_status: 'trialing', provider_subscription_id: null, payment_method: null }));
    asaas.criarCheckoutCartao.mockResolvedValue({ checkoutId: 'chk-2', url: 'https://asaas/c/2' });
    await billingService.createCheckoutSession(ID, 'basico', 'card');
    expect(repo.mesclarMetadataCobranca).toHaveBeenCalledWith(ID, expect.objectContaining({
      checkoutCartao: expect.objectContaining({ id: 'chk-2' }),
      checkoutsCartao: ['chk-1', 'chk-2'],
    }));
  });

  it('cobrança de uma assinatura nova remove a antiga que estava ligada', async () => {
    repo.findByProviderSubscriptionId.mockResolvedValue(null);
    repo.findByCheckoutCartao.mockResolvedValue(cartaoAtivo({ subscription_status: 'past_due' }));
    asaas.buscarAssinatura.mockResolvedValue({ id: 'sub_2', creditCard: { creditCardToken: 'tok_2' } });
    await webhook('PAYMENT_CONFIRMED', cobranca({ id: 'pay_9', subscription: 'sub_2', checkoutSession: 'chk-2', dueDate: '2026-11-03', confirmedDate: '2026-11-03' }));
    expect(asaas.cancelSubscription).toHaveBeenCalledWith('sub_1');
    expect(repo.updateSubscriptionState).toHaveBeenCalledWith(ID, expect.objectContaining({ providerSubscriptionId: 'sub_2' }), null);
  });
});

describe('I1: cobrança recusada no fim do teste com cartão', () => {
  it('cai na carência, não no bloqueio imediato', () => {
    const r = calcularEstadoConta({
      status: 'past_due', jaPagou: false, cartaoCadastrado: true,
      inadimplenteDesde: new Date('2026-11-15T12:00:00Z'), fimDoPeriodo: new Date('2026-11-15T12:00:00Z'),
      agora: new Date('2026-11-17T12:00:00Z'),
    });
    expect(r).toMatchObject({ tipo: 'carencia' });
  });

  it('depois da carência, bloqueia como teste encerrado', () => {
    const r = calcularEstadoConta({
      status: 'past_due', jaPagou: false, cartaoCadastrado: true,
      inadimplenteDesde: new Date('2026-11-15T12:00:00Z'), fimDoPeriodo: new Date('2026-11-15T12:00:00Z'),
      agora: new Date('2026-11-25T12:00:00Z'),
    });
    expect(r).toEqual({ tipo: 'bloqueada', motivo: 'teste' });
  });
});

describe('I2: reativar no teste usa o plano escolhido', () => {
  it('recria a assinatura no valor do plano escolhido no checkout', async () => {
    repo.getBusinessBillingContext.mockResolvedValue(cartaoAtivo({
      subscription_status: 'trialing', plan: 'profissional', subscription_cancel_at_period_end: true,
    }));
    asaas.criarAssinaturaComToken.mockResolvedValue({ id: 'sub_2' });
    await billingService.reactivateSubscription(ID);
    expect(asaas.criarAssinaturaComToken).toHaveBeenCalledWith(expect.objectContaining({
      valor: 49.9, externalReference: `business:${ID}:plan:basico:cartao`,
    }));
  });
});

describe('I3: estender teste de quem cancelou o cartão', () => {
  it('não mexe no Asaas quando a assinatura já foi removida', async () => {
    repo.getBusinessBillingContext.mockResolvedValue(cartaoAtivo({ subscription_status: 'trialing', subscription_cancel_at_period_end: true }));
    expect(await billingService.moverVencimentoDoTesteCartao(ID, new Date('2026-11-25T15:00:00Z'))).toBe(false);
    expect(asaas.atualizarAssinatura).not.toHaveBeenCalled();
  });
});

describe('I4: "Já paguei" com cartão no teste', () => {
  it('consultar a cobrança pendente do teste não tira a conta do teste', async () => {
    repo.getBusinessBillingContext.mockResolvedValue(cartaoAtivo({ subscription_status: 'trialing', subscription_current_period_end: new Date('2026-11-15T12:00:00Z') }));
    asaas.getPaymentWithPixData.mockResolvedValue({
      payment: cobranca({ status: 'PENDING', dueDate: '2026-11-15', confirmedDate: null }), pixData: null,
    });
    await billingService.getPixPaymentStatus(ID, 'pay_1');
    expect(repo.updateSubscriptionState).not.toHaveBeenCalled();
  });
});
