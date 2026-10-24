import { vi, describe, it, expect, beforeEach } from 'vitest';

const repo = vi.hoisted(() => ({
  contarProfissionaisAtivas: vi.fn(),
  nomesProfissionaisAtivas: vi.fn(),
  aplicarPlano: vi.fn(),
  agendarPlano: vi.fn(),
  limparPlanoAgendado: vi.fn(),
  upgradePendente: vi.fn(),
  marcarPagamento: vi.fn(),
  mensalidadePixAberta: vi.fn(),
  pagamentosPix: vi.fn(),
  downgradesVencidos: vi.fn(),
}));

const subs = vi.hoisted(() => ({
  getBusinessBillingContext: vi.fn(),
  upsertBillingPayment: vi.fn(),
  setAsaasCustomerId: vi.fn(),
}));

const stripe = vi.hoisted(() => ({
  subscriptions: { retrieve: vi.fn(), update: vi.fn() },
  subscriptionSchedules: { create: vi.fn(), retrieve: vi.fn(), update: vi.fn(), release: vi.fn() },
}));

const asaas = vi.hoisted(() => ({
  createPixCharge: vi.fn(),
  getPaymentWithPixData: vi.fn(),
  getOrCreateAsaasCustomer: vi.fn(),
}));

const asaasClient = vi.hoisted(() => ({ delete: vi.fn() }));

vi.mock('../modules/billing/planChange.repository.js', () => ({ planChangeRepository: repo }));
vi.mock('../repositories/subscriptionRepository.js', () => ({ subscriptionRepository: subs }));
vi.mock('../config/stripe.js', () => ({ getStripeClient: () => stripe }));
vi.mock('../integrations/asaas/service.js', () => ({ asaasService: asaas }));
vi.mock('../integrations/asaas/client.js', () => ({ asaasClient }));
vi.mock('../services/stripePricingService.js', () => ({
  stripePricingService: {
    resolveCheckoutPricing: ({ plan }: { plan: string }) => ({ priceId: `price_${plan}` }),
  },
}));
vi.mock('../utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { planChangeService } = await import('../modules/billing/planChange.service.js');

const agora = Date.now();
const DIA = 24 * 60 * 60 * 1000;

const ctxPix = (extra: Record<string, unknown> = {}) => ({
  id: 'b1',
  plan: 'profissional',
  provider: 'asaas',
  payment_method: 'pix',
  provider_customer_id: 'cus_1',
  subscription_status: 'active',
  current_period_start: new Date(agora - 15 * DIA),
  current_period_end: new Date(agora + 15 * DIA),
  ...extra,
});

const ctxCartao = (extra: Record<string, unknown> = {}) => ({
  ...ctxPix(),
  provider: 'stripe',
  payment_method: 'card',
  stripe_subscription_id: 'sub_1',
  stripe_customer_id: 'cus_s1',
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  repo.upgradePendente.mockResolvedValue(null);
  repo.contarProfissionaisAtivas.mockResolvedValue(1);
  asaas.getPaymentWithPixData.mockResolvedValue({ pixData: { pixCopyPaste: 'copia', qrCode: 'qr' } });
});

describe('planChangeService.previa', () => {
  it('upgrade mostra o proporcional de hoje e o valor mensal novo', async () => {
    subs.getBusinessBillingContext.mockResolvedValue(ctxPix());
    const p = await planChangeService.previa('b1', 'premium');
    expect(p.tipo).toBe('upgrade');
    expect(p.valorHoje).toBe(50);
    expect(p.dias).toBe(15);
    expect(p.valorMensalNovo).toBe(199.9);
    expect(p.formaPagamento).toBe('pix');
  });

  it('downgrade traz o bloqueio por profissionais', async () => {
    subs.getBusinessBillingContext.mockResolvedValue(ctxPix());
    repo.contarProfissionaisAtivas.mockResolvedValue(3);
    const p = await planChangeService.previa('b1', 'basico');
    expect(p.tipo).toBe('downgrade');
    expect(p.valorHoje).toBe(0);
    expect(p.bloqueio?.motivo).toContain('Desative 2');
  });

  it('recusa o mesmo plano e conta sem assinatura paga', async () => {
    subs.getBusinessBillingContext.mockResolvedValue(ctxPix());
    await expect(planChangeService.previa('b1', 'profissional')).rejects.toMatchObject({ code: 'MESMO_PLANO' });

    subs.getBusinessBillingContext.mockResolvedValue(ctxPix({ subscription_status: 'trialing' }));
    await expect(planChangeService.previa('b1', 'premium')).rejects.toMatchObject({ statusCode: 409, code: 'SEM_ASSINATURA_ATIVA' });

    subs.getBusinessBillingContext.mockResolvedValue(ctxPix({ provider: 'coupon', payment_method: 'coupon' }));
    await expect(planChangeService.previa('b1', 'premium')).rejects.toMatchObject({ code: 'SEM_ASSINATURA_ATIVA' });
  });

  it('negócio inexistente → 404', async () => {
    subs.getBusinessBillingContext.mockResolvedValue(null);
    await expect(planChangeService.previa('x', 'premium')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('upgrade no Pix', () => {
  it('cria a cobrança avulsa da diferença marcada como upgrade, sem trocar o plano', async () => {
    subs.getBusinessBillingContext.mockResolvedValue(ctxPix());
    asaas.createPixCharge.mockResolvedValue({ id: 'pay_up', status: 'PENDING', dueDate: '2026-10-25' });

    const r = await planChangeService.trocar('b1', 'premium');

    expect(asaas.createPixCharge).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'cus_1', amount: 50, externalReference: 'business:b1:plan:premium:upgrade' })
    );
    expect(subs.upsertBillingPayment).toHaveBeenCalledWith(
      expect.objectContaining({ providerPaymentId: 'pay_up', tipo: 'upgrade', plano: 'premium', internalStatus: 'pending' })
    );
    expect(repo.aplicarPlano).not.toHaveBeenCalled();
    expect(r).toEqual({
      tipo: 'upgrade',
      status: 'aguardando',
      plano: 'premium',
      valor: 50,
      paymentId: 'pay_up',
      pixCopyPaste: 'copia',
      qrCode: 'qr',
    });
  });

  it('pedir de novo devolve a mesma cobrança', async () => {
    subs.getBusinessBillingContext.mockResolvedValue(ctxPix());
    repo.upgradePendente.mockResolvedValue({
      id: 'bp1',
      plano: 'premium',
      amount: 50,
      providerPaymentId: 'pay_up',
      pixCopyPaste: 'copia',
      qrCode: 'qr',
    });

    const r = await planChangeService.trocar('b1', 'premium');
    expect(asaas.createPixCharge).not.toHaveBeenCalled();
    expect(r).toMatchObject({ status: 'aguardando', paymentId: 'pay_up' });
  });

  it('pendente de outro plano é cancelado antes de criar o novo', async () => {
    subs.getBusinessBillingContext.mockResolvedValue(ctxPix({ plan: 'basico' }));
    repo.upgradePendente.mockResolvedValue({ id: 'bp1', plano: 'profissional', providerPaymentId: 'pay_old' });
    asaas.createPixCharge.mockResolvedValue({ id: 'pay_new', status: 'PENDING' });

    await planChangeService.trocar('b1', 'premium');
    expect(asaasClient.delete).toHaveBeenCalledWith('/payments/pay_old');
    expect(repo.marcarPagamento).toHaveBeenCalledWith('bp1', 'canceled', 'DELETED');
    expect(asaas.createPixCharge).toHaveBeenCalled();
  });

  it('diferença abaixo de R$ 5 aplica o plano sem cobrar', async () => {
    // Solo → Equipe com 1 dia restante: 50,00 × 1/16 = 3,12
    subs.getBusinessBillingContext.mockResolvedValue(ctxPix({ plan: 'basico', current_period_end: new Date(agora + 0.5 * DIA) }));
    const r = await planChangeService.trocar('b1', 'profissional');
    expect(asaas.createPixCharge).not.toHaveBeenCalled();
    expect(repo.aplicarPlano).toHaveBeenCalledWith('b1', 'profissional');
    expect(r).toEqual({ tipo: 'upgrade', status: 'pago', plano: 'profissional' });
  });
});

describe('upgrade no cartão', () => {
  beforeEach(() => {
    stripe.subscriptions.retrieve.mockResolvedValue({ id: 'sub_1', schedule: null, items: { data: [{ id: 'si_1' }] } });
  });

  it('troca o Price com proporcional e só aplica depois de pago', async () => {
    subs.getBusinessBillingContext.mockResolvedValue(ctxCartao());
    stripe.subscriptions.update.mockResolvedValueOnce({ id: 'sub_1', pending_update: null, metadata: { plan: 'profissional' } });
    stripe.subscriptions.update.mockResolvedValueOnce({});

    const r = await planChangeService.trocar('b1', 'premium');

    expect(stripe.subscriptions.update).toHaveBeenNthCalledWith(1, 'sub_1', {
      items: [{ id: 'si_1', price: 'price_premium' }],
      proration_behavior: 'always_invoice',
      payment_behavior: 'pending_if_incomplete',
    });
    expect(stripe.subscriptions.update).toHaveBeenNthCalledWith(2, 'sub_1', { metadata: { plan: 'premium' } });
    expect(repo.aplicarPlano).toHaveBeenCalledWith('b1', 'premium');
    expect(r).toEqual({ tipo: 'upgrade', status: 'pago', plano: 'premium' });
  });

  it('cartão recusado não troca o plano', async () => {
    subs.getBusinessBillingContext.mockResolvedValue(ctxCartao());
    stripe.subscriptions.update.mockResolvedValueOnce({ id: 'sub_1', pending_update: { expires_at: 1 } });

    const r = await planChangeService.trocar('b1', 'premium');
    expect(r).toMatchObject({ status: 'falhou' });
    expect(repo.aplicarPlano).not.toHaveBeenCalled();
    expect(stripe.subscriptions.update).toHaveBeenCalledTimes(1);
  });

  it('solta o schedule de um downgrade agendado antes do upgrade', async () => {
    subs.getBusinessBillingContext.mockResolvedValue(ctxCartao({ plan: 'basico', plano_agendado: null }));
    stripe.subscriptions.retrieve
      .mockResolvedValueOnce({ id: 'sub_1', schedule: 'sched_1', items: { data: [{ id: 'si_1' }] } })
      .mockResolvedValueOnce({ id: 'sub_1', schedule: null, items: { data: [{ id: 'si_1' }] } });
    stripe.subscriptions.update.mockResolvedValue({ id: 'sub_1', pending_update: null });

    await planChangeService.trocar('b1', 'profissional');
    expect(stripe.subscriptionSchedules.release).toHaveBeenCalledWith('sched_1');
  });
});

describe('downgrade', () => {
  it('Pix: agenda para o fim do período', async () => {
    const ctx = ctxPix();
    subs.getBusinessBillingContext.mockResolvedValue(ctx);
    const r = await planChangeService.trocar('b1', 'basico');
    expect(repo.agendarPlano).toHaveBeenCalledWith('b1', 'basico', ctx.current_period_end);
    expect(r).toEqual({ tipo: 'downgrade', agendadoPara: ctx.current_period_end.toISOString(), plano: 'basico' });
    expect(stripe.subscriptionSchedules.create).not.toHaveBeenCalled();
  });

  it('bloqueado por profissionais → 409 e nada agendado', async () => {
    subs.getBusinessBillingContext.mockResolvedValue(ctxPix());
    repo.contarProfissionaisAtivas.mockResolvedValue(2);
    await expect(planChangeService.trocar('b1', 'basico')).rejects.toMatchObject({ statusCode: 409, code: 'DOWNGRADE_BLOQUEADO' });
    expect(repo.agendarPlano).not.toHaveBeenCalled();
  });

  it('cartão: cria o schedule com a fase atual até a renovação e a nova depois', async () => {
    subs.getBusinessBillingContext.mockResolvedValue(ctxCartao({ plan: 'premium' }));
    stripe.subscriptions.retrieve.mockResolvedValue({ id: 'sub_1', schedule: null, current_period_end: 1800000000 });
    stripe.subscriptionSchedules.create.mockResolvedValue({ id: 'sched_1' });
    stripe.subscriptionSchedules.retrieve.mockResolvedValue({ phases: [{ start_date: 1797000000 }] });

    await planChangeService.trocar('b1', 'profissional');

    expect(stripe.subscriptionSchedules.create).toHaveBeenCalledWith({ from_subscription: 'sub_1' });
    expect(stripe.subscriptionSchedules.update).toHaveBeenCalledWith('sched_1', {
      end_behavior: 'release',
      phases: [
        { items: [{ price: 'price_premium', quantity: 1 }], start_date: 1797000000, end_date: 1800000000 },
        {
          items: [{ price: 'price_profissional', quantity: 1 }],
          iterations: 1,
          proration_behavior: 'none',
          metadata: { plan: 'profissional' },
        },
      ],
    });
    expect(repo.agendarPlano).toHaveBeenCalled();
  });
});

describe('cancelar mudança', () => {
  it('downgrade agendado no cartão solta o schedule e limpa', async () => {
    subs.getBusinessBillingContext.mockResolvedValue(ctxCartao({ plan: 'premium', plano_agendado: 'basico' }));
    stripe.subscriptions.retrieve.mockResolvedValue({ id: 'sub_1', schedule: { id: 'sched_1' } });
    expect(await planChangeService.cancelar('b1')).toEqual({ cancelado: 'downgrade' });
    expect(stripe.subscriptionSchedules.release).toHaveBeenCalledWith('sched_1');
    expect(repo.limparPlanoAgendado).toHaveBeenCalledWith('b1', 'premium');
  });

  it('upgrade Pix pendente cancela a cobrança no Asaas', async () => {
    subs.getBusinessBillingContext.mockResolvedValue(ctxPix());
    repo.upgradePendente.mockResolvedValue({ id: 'bp1', providerPaymentId: 'pay_up' });
    expect(await planChangeService.cancelar('b1')).toEqual({ cancelado: 'upgrade' });
    expect(asaasClient.delete).toHaveBeenCalledWith('/payments/pay_up');
    expect(repo.marcarPagamento).toHaveBeenCalledWith('bp1', 'canceled', 'DELETED');
  });

  it('sem nada pendente → 404', async () => {
    subs.getBusinessBillingContext.mockResolvedValue(ctxPix());
    await expect(planChangeService.cancelar('b1')).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('webhook da diferença no Pix', () => {
  it('pago aplica o plano e grava como upgrade', async () => {
    subs.getBusinessBillingContext.mockResolvedValue(ctxPix());
    await planChangeService.webhookUpgradePix({ id: 'pay_up', status: 'RECEIVED', value: 50 }, 'b1', 'premium');
    expect(subs.upsertBillingPayment).toHaveBeenCalledWith(
      expect.objectContaining({ providerPaymentId: 'pay_up', tipo: 'upgrade', internalStatus: 'active' })
    );
    expect(repo.aplicarPlano).toHaveBeenCalledWith('b1', 'premium');
  });

  it('repetido (plano já aplicado) não aplica de novo', async () => {
    subs.getBusinessBillingContext.mockResolvedValue(ctxPix({ plan: 'premium' }));
    await planChangeService.webhookUpgradePix({ id: 'pay_up', status: 'CONFIRMED' }, 'b1', 'premium');
    expect(repo.aplicarPlano).not.toHaveBeenCalled();
  });

  it('pendente ou vencido só atualiza o registro', async () => {
    await planChangeService.webhookUpgradePix({ id: 'pay_up', status: 'OVERDUE' }, 'b1', 'premium');
    expect(subs.getBusinessBillingContext).not.toHaveBeenCalled();
    expect(repo.aplicarPlano).not.toHaveBeenCalled();
  });
});

describe('rotina de downgrades vencidos', () => {
  it('aplica o plano agendado de cada negócio vencido', async () => {
    repo.downgradesVencidos.mockResolvedValue([
      { id: 'b1', plan: 'premium', planoAgendado: 'profissional' },
      { id: 'b2', plan: 'profissional', planoAgendado: 'basico' },
    ]);
    expect(await planChangeService.aplicarDowngradesVencidos(new Date())).toBe(2);
    expect(repo.aplicarPlano).toHaveBeenCalledWith('b1', 'profissional');
    expect(repo.aplicarPlano).toHaveBeenCalledWith('b2', 'basico');
  });
});
