import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const repo = vi.hoisted(() => ({
  getBusinessBillingContext: vi.fn(),
  updateSubscriptionState: vi.fn(),
  cobrancaPendenteCartao: vi.fn(),
}));
const asaas = vi.hoisted(() => ({
  cancelSubscription: vi.fn(),
  criarAssinaturaComToken: vi.fn(),
  atualizarCobranca: vi.fn(),
  atualizarAssinatura: vi.fn(),
}));

vi.mock('../repositories/subscriptionRepository.js', () => ({ subscriptionRepository: repo }));
vi.mock('../integrations/asaas/service.js', () => ({ asaasService: asaas }));
vi.mock('../modules/conta/estadoConta.service.js', () => ({ estadoContaService: { invalidar: vi.fn() } }));
vi.mock('../utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../config/prisma.js', () => ({ prisma: { $queryRaw: vi.fn().mockResolvedValue([]) } }));

const { billingService } = await import('../services/billingService.js');
const { motivoParaNaoEstenderTeste } = await import('../modules/admin/painel.rules.js');
const { calcularEstadoConta } = await import('../modules/conta/estadoConta.rules.js');

const ID = '11111111-1111-4111-8111-111111111111';
const cartao = (extra: Record<string, unknown> = {}) => ({
  id: ID, plan: 'basico', provider: 'asaas', payment_method: 'card',
  provider_subscription_id: 'sub_1', provider_customer_id: 'cus_9',
  subscription_status: 'active', subscription_cancel_at_period_end: false,
  current_period_end: new Date('2026-11-20T12:00:00Z'),
  subscription_current_period_end: new Date('2026-11-20T12:00:00Z'),
  metadata: { cartao: { token: 'tok_1', bandeira: 'VISA', final: '4444' } },
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-03T12:00:00-03:00'));
  asaas.criarAssinaturaComToken.mockResolvedValue({ id: 'sub_2' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('cancelar e reativar no cartão', () => {
  it('cancelar no cartão remove a assinatura no Asaas e mantém o acesso até o fim do período', async () => {
    repo.getBusinessBillingContext.mockResolvedValue(cartao());
    const r = await billingService.cancelSubscription(ID);
    expect(asaas.cancelSubscription).toHaveBeenCalledWith('sub_1');
    expect(repo.updateSubscriptionState).toHaveBeenCalledWith(ID, expect.objectContaining({
      subscriptionStatus: 'active', paymentMethod: 'card', cancelAtPeriodEnd: true,
    }));
    expect(r).toMatchObject({ subscriptionStatus: 'active', cancelAtPeriodEnd: true });
  });

  it('cancelar no teste com cartão continua em teste até o fim, sem cobrança', async () => {
    repo.getBusinessBillingContext.mockResolvedValue(cartao({ subscription_status: 'trialing', current_period_end: null }));
    const r = await billingService.cancelSubscription(ID);
    expect(asaas.cancelSubscription).toHaveBeenCalledWith('sub_1');
    expect(repo.updateSubscriptionState).toHaveBeenCalledWith(ID, expect.objectContaining({ subscriptionStatus: 'trialing', cancelAtPeriodEnd: true }));
    expect(r).toMatchObject({ subscriptionStatus: 'trialing' });
  });

  it('reativar no cartão cria a assinatura de novo com o cartão guardado, sem checkout', async () => {
    repo.getBusinessBillingContext.mockResolvedValue(cartao({ subscription_cancel_at_period_end: true }));
    const r = await billingService.reactivateSubscription(ID);
    expect(asaas.criarAssinaturaComToken).toHaveBeenCalledWith({
      customerId: 'cus_9', token: 'tok_1', valor: 49.9, nextDueDate: '2026-11-20',
      externalReference: `business:${ID}:plan:basico:cartao`,
    });
    expect(repo.updateSubscriptionState).toHaveBeenCalledWith(ID, expect.objectContaining({
      providerSubscriptionId: 'sub_2', cancelAtPeriodEnd: false, paymentMethod: 'card',
    }));
    expect(r).toMatchObject({ reactivationMode: 'resumed' });
  });

  it('reativar com downgrade agendado usa o valor do plano novo', async () => {
    repo.getBusinessBillingContext.mockResolvedValue(cartao({ plan: 'premium', plano_agendado: 'basico', subscription_cancel_at_period_end: true }));
    await billingService.reactivateSubscription(ID);
    expect(asaas.criarAssinaturaComToken).toHaveBeenCalledWith(expect.objectContaining({ valor: 49.9 }));
  });
});

describe('estender teste com cartão', () => {
  it('move o vencimento da cobrança pendente e da assinatura no Asaas', async () => {
    repo.getBusinessBillingContext.mockResolvedValue(cartao({ subscription_status: 'trialing' }));
    repo.cobrancaPendenteCartao.mockResolvedValue('pay_1');
    const movido = await billingService.moverVencimentoDoTesteCartao(ID, new Date('2026-11-25T15:00:00Z'));
    expect(movido).toBe(true);
    expect(asaas.atualizarCobranca).toHaveBeenCalledWith('pay_1', { dueDate: '2026-11-25' });
    expect(asaas.atualizarAssinatura).toHaveBeenCalledWith('sub_1', { nextDueDate: '2026-12-25', updatePendingPayments: false });
  });

  it('teste sem cartão não chama o Asaas', async () => {
    repo.getBusinessBillingContext.mockResolvedValue(cartao({ subscription_status: 'trialing', payment_method: null, provider_subscription_id: null }));
    expect(await billingService.moverVencimentoDoTesteCartao(ID, new Date('2026-11-25T15:00:00Z'))).toBe(false);
    expect(asaas.atualizarAssinatura).not.toHaveBeenCalled();
  });

  it('o SuperAdmin pode estender o teste de quem cadastrou o cartão', () => {
    expect(motivoParaNaoEstenderTeste({ statusAssinatura: 'trialing', jaPagou: false }, true)).toBeNull();
  });
});

describe('contingência no cartão', () => {
  it('segue a mesma regra do Pix: a carência começa no fim do período pago', () => {
    const base = {
      ativo: true, status: 'past_due', plano: 'basico', jaPagou: true,
      fimDoPeriodo: new Date('2026-11-01T12:00:00Z'),
      inadimplenteDesde: new Date('2026-10-25T12:00:00Z'),
      agora: new Date('2026-11-03T12:00:00Z'),
    };
    expect(calcularEstadoConta(base as never)).toMatchObject({ tipo: 'carencia', desde: new Date('2026-11-01T12:00:00Z') });
  });
});
