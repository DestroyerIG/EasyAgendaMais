import { vi, describe, it, expect, beforeEach } from 'vitest';

const repo = vi.hoisted(() => ({
  pagamentosPix: vi.fn(),
  mensalidadePixAberta: vi.fn(),
  upgradePendente: vi.fn(),
  nomesProfissionaisAtivas: vi.fn(),
}));
const subs = vi.hoisted(() => ({ getBusinessBillingContext: vi.fn() }));
const stripe = vi.hoisted(() => ({ invoices: { list: vi.fn() }, subscriptions: { retrieve: vi.fn() } }));

vi.mock('../modules/billing/planChange.repository.js', () => ({ planChangeRepository: repo }));
vi.mock('../repositories/subscriptionRepository.js', () => ({ subscriptionRepository: subs }));
vi.mock('../config/stripe.js', () => ({ getStripeClient: () => stripe }));
vi.mock('../utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { billingInfoService } = await import('../modules/billing/billingInfo.service.js');

const pagamento = (extra: Record<string, unknown> = {}) => ({
  id: 'bp',
  providerPaymentId: 'pay_1',
  externalStatus: 'RECEIVED',
  internalStatus: 'active',
  amount: 99.9,
  dueDate: new Date('2026-09-15T12:00:00Z'),
  paidAt: new Date('2026-09-15T12:00:00Z'),
  createdAt: new Date('2026-09-14T12:00:00Z'),
  tipo: 'mensalidade',
  plano: 'profissional',
  pixCopyPaste: null,
  qrCode: null,
  metadata: { rawPayment: { invoiceUrl: 'https://asaas/i/1' } },
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  repo.pagamentosPix.mockResolvedValue([]);
});

describe('faturas', () => {
  it('Pix: referência, período de um mês, status e link da fatura', async () => {
    subs.getBusinessBillingContext.mockResolvedValue({ id: 'b1', plan: 'profissional' });
    repo.pagamentosPix.mockResolvedValue([pagamento()]);

    const { anos, itens } = await billingInfoService.faturas('b1', null);
    expect(anos).toEqual([2026]);
    expect(itens[0]).toMatchObject({
      referencia: 'Mensalidade EasyAgenda+ Equipe',
      valor: 99.9,
      forma: 'pix',
      status: 'pago',
      tipo: 'mensalidade',
      url: 'https://asaas/i/1',
      periodoInicio: '2026-09-15T12:00:00.000Z',
      periodoFim: '2026-10-14T12:00:00.000Z',
    });
  });

  it('diferença de upgrade aparece como upgrade; a cancelada some', async () => {
    subs.getBusinessBillingContext.mockResolvedValue({ id: 'b1', plan: 'premium' });
    repo.pagamentosPix.mockResolvedValue([
      pagamento({ providerPaymentId: 'up1', tipo: 'upgrade', plano: 'premium', amount: 50 }),
      pagamento({ providerPaymentId: 'up2', tipo: 'upgrade', plano: 'premium', externalStatus: 'DELETED', internalStatus: 'canceled' }),
    ]);
    const { itens } = await billingInfoService.faturas('b1', null);
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({ referencia: 'Diferença do upgrade para Salão', tipo: 'upgrade', periodoInicio: null });
  });

  it('status do Asaas: em aberto, vencido e estornado', async () => {
    subs.getBusinessBillingContext.mockResolvedValue({ id: 'b1', plan: 'basico' });
    repo.pagamentosPix.mockResolvedValue([
      pagamento({ providerPaymentId: 'a', externalStatus: 'PENDING', paidAt: null }),
      pagamento({ providerPaymentId: 'b', externalStatus: 'OVERDUE', paidAt: null }),
      pagamento({ providerPaymentId: 'c', externalStatus: 'REFUNDED' }),
    ]);
    const { itens } = await billingInfoService.faturas('b1', null);
    expect(itens.map((f) => f.status).sort()).toEqual(['em_aberto', 'estornado', 'vencido']);
  });

  it('Stripe: junta as faturas do cartão, sem rascunho, e filtra por ano', async () => {
    subs.getBusinessBillingContext.mockResolvedValue({ id: 'b1', plan: 'profissional', stripe_customer_id: 'cus_s' });
    repo.pagamentosPix.mockResolvedValue([pagamento({ paidAt: new Date('2025-12-01T00:00:00Z') })]);
    stripe.invoices.list.mockResolvedValue({
      data: [
        {
          id: 'in_1',
          status: 'paid',
          amount_paid: 9990,
          amount_due: 9990,
          created: 1789000000,
          status_transitions: { paid_at: 1789000000 },
          billing_reason: 'subscription_cycle',
          hosted_invoice_url: 'https://stripe/i/1',
          lines: { data: [{ period: { start: 1789000000, end: 1791600000 } }] },
        },
        { id: 'in_2', status: 'draft', amount_due: 1, created: 1789000000 },
      ],
    });

    const todas = await billingInfoService.faturas('b1', null);
    expect(todas.anos).toEqual([2026, 2025]);
    expect(todas.itens[0]).toMatchObject({ id: 'stripe:in_1', valor: 99.9, forma: 'card', status: 'pago', url: 'https://stripe/i/1' });

    const de2025 = await billingInfoService.faturas('b1', 2025);
    expect(de2025.itens).toHaveLength(1);
    expect(de2025.itens[0]!.forma).toBe('pix');
  });

  it('erro no Stripe não derruba a lista do Pix', async () => {
    subs.getBusinessBillingContext.mockResolvedValue({ id: 'b1', plan: 'profissional', stripe_customer_id: 'cus_s' });
    repo.pagamentosPix.mockResolvedValue([pagamento()]);
    stripe.invoices.list.mockRejectedValue(new Error('down'));
    const { itens } = await billingInfoService.faturas('b1', null);
    expect(itens).toHaveLength(1);
  });
});

describe('forma de pagamento', () => {
  it('cartão do Stripe: bandeira, final, titular e validade', async () => {
    subs.getBusinessBillingContext.mockResolvedValue({ id: 'b1', provider: 'stripe', stripe_subscription_id: 'sub_1' });
    stripe.subscriptions.retrieve.mockResolvedValue({
      customer: { invoice_settings: { default_payment_method: null } },
      default_payment_method: {
        card: { brand: 'mastercard', last4: '8821', exp_month: 8, exp_year: 2028 },
        billing_details: { name: 'Carla R. Silva' },
      },
    });
    expect(await billingInfoService.formaPagamento('b1')).toEqual({
      tipo: 'card',
      bandeira: 'Mastercard',
      final: '8821',
      titular: 'Carla R. Silva',
      validade: '08/28',
    });
  });

  it('Pix: traz a mensalidade em aberto', async () => {
    subs.getBusinessBillingContext.mockResolvedValue({ id: 'b1', provider: 'asaas', payment_method: 'pix' });
    repo.mensalidadePixAberta.mockResolvedValue(
      pagamento({ providerPaymentId: 'pay_open', externalStatus: 'PENDING', pixCopyPaste: 'copia', qrCode: 'qr', amount: 49.9 })
    );
    expect(await billingInfoService.formaPagamento('b1')).toMatchObject({
      tipo: 'pix',
      cobrancaAberta: { paymentId: 'pay_open', valor: 49.9, pixCopyPaste: 'copia', qrCode: 'qr' },
    });
  });

  it('sem provedor → null', async () => {
    subs.getBusinessBillingContext.mockResolvedValue({ id: 'b1', provider: 'coupon' });
    expect(await billingInfoService.formaPagamento('b1')).toBeNull();
  });
});

describe('complemento do status', () => {
  it('mudança agendada, upgrade pendente e profissionais ativas', async () => {
    subs.getBusinessBillingContext.mockResolvedValue({
      id: 'b1',
      plano_agendado: 'basico',
      plano_agendado_em: new Date('2026-11-14T00:00:00Z'),
    });
    repo.upgradePendente.mockResolvedValue(null);
    repo.nomesProfissionaisAtivas.mockResolvedValue(['Bruno', 'Carla']);
    expect(await billingInfoService.complementoStatus('b1')).toEqual({
      planoAgendado: 'basico',
      planoAgendadoEm: '2026-11-14T00:00:00.000Z',
      upgradePendente: null,
      profissionaisAtivas: 2,
      nomesProfissionais: ['Bruno', 'Carla'],
    });
  });
});
