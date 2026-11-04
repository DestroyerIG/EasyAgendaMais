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

const asaas = vi.hoisted(() => ({
  createPixCharge: vi.fn(),
  getPaymentWithPixData: vi.fn(),
  getOrCreateAsaasCustomer: vi.fn(),
  criarCobrancaCartao: vi.fn(),
  atualizarAssinatura: vi.fn(),
}));

const asaasClient = vi.hoisted(() => ({ delete: vi.fn() }));

vi.mock('../modules/billing/planChange.repository.js', () => ({ planChangeRepository: repo }));
vi.mock('../repositories/subscriptionRepository.js', () => ({ subscriptionRepository: subs }));
vi.mock('../integrations/asaas/service.js', () => ({ asaasService: asaas }));
vi.mock('../integrations/asaas/client.js', () => ({ asaasClient }));
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
  provider: 'asaas',
  payment_method: 'card',
  provider_subscription_id: 'sub_1',
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
      invoiceUrl: null,
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
  it('cobra a diferença numa cobrança avulsa de cartão, paga na página do Asaas', async () => {
    subs.getBusinessBillingContext.mockResolvedValue(ctxCartao());
    asaas.criarCobrancaCartao.mockResolvedValue({ id: 'pay_up', status: 'PENDING', dueDate: '2026-11-03', invoiceUrl: 'https://asaas.test/i/pay_up' });

    const r = await planChangeService.trocar('b1', 'premium');

    expect(asaas.criarCobrancaCartao).toHaveBeenCalledWith(expect.objectContaining({
      customerId: 'cus_1', externalReference: 'business:b1:plan:premium:upgrade',
    }));
    expect(subs.upsertBillingPayment).toHaveBeenCalledWith(expect.objectContaining({
      providerPaymentId: 'pay_up', paymentMethod: 'card', tipo: 'upgrade', plano: 'premium',
    }));
    expect(repo.aplicarPlano).not.toHaveBeenCalled();
    expect(r).toMatchObject({ tipo: 'upgrade', status: 'aguardando', plano: 'premium', paymentId: 'pay_up', invoiceUrl: 'https://asaas.test/i/pay_up' });
  });

  it('pedir de novo devolve a mesma cobrança com o link da fatura', async () => {
    subs.getBusinessBillingContext.mockResolvedValue(ctxCartao());
    repo.upgradePendente.mockResolvedValue({ id: 'bp1', plano: 'premium', providerPaymentId: 'pay_up', amount: 50, pixCopyPaste: null, qrCode: null, metadata: { rawPayment: { invoiceUrl: 'https://asaas.test/i/pay_up' } } });
    const r = await planChangeService.trocar('b1', 'premium');
    expect(asaas.criarCobrancaCartao).not.toHaveBeenCalled();
    expect(r).toMatchObject({ status: 'aguardando', paymentId: 'pay_up', invoiceUrl: 'https://asaas.test/i/pay_up' });
  });
});

describe('downgrade', () => {
  it('Pix: agenda para o fim do período', async () => {
    const ctx = ctxPix();
    subs.getBusinessBillingContext.mockResolvedValue(ctx);
    const r = await planChangeService.trocar('b1', 'basico');
    expect(repo.agendarPlano).toHaveBeenCalledWith('b1', 'basico', ctx.current_period_end);
    expect(r).toEqual({ tipo: 'downgrade', agendadoPara: ctx.current_period_end.toISOString(), plano: 'basico' });
    expect(asaas.atualizarAssinatura).not.toHaveBeenCalled();
  });

  it('bloqueado por profissionais → 409 e nada agendado', async () => {
    subs.getBusinessBillingContext.mockResolvedValue(ctxPix());
    repo.contarProfissionaisAtivas.mockResolvedValue(2);
    await expect(planChangeService.trocar('b1', 'basico')).rejects.toMatchObject({ statusCode: 409, code: 'DOWNGRADE_BLOQUEADO' });
    expect(repo.agendarPlano).not.toHaveBeenCalled();
  });

  it('cartão: agenda e já muda o valor da assinatura, incluindo a cobrança do próximo ciclo', async () => {
    const ctx = ctxCartao({ plan: 'premium' });
    subs.getBusinessBillingContext.mockResolvedValue(ctx);
    await planChangeService.trocar('b1', 'profissional');
    expect(asaas.atualizarAssinatura).toHaveBeenCalledWith('sub_1', { value: 99.9, updatePendingPayments: true });
    expect(repo.agendarPlano).toHaveBeenCalledWith('b1', 'profissional', ctx.current_period_end);
  });
});

describe('cancelar mudança', () => {
  it('downgrade agendado no cartão volta o valor da assinatura e limpa', async () => {
    subs.getBusinessBillingContext.mockResolvedValue(ctxCartao({ plan: 'premium', plano_agendado: 'basico' }));
    expect(await planChangeService.cancelar('b1')).toEqual({ cancelado: 'downgrade' });
    expect(asaas.atualizarAssinatura).toHaveBeenCalledWith('sub_1', { value: 199.9, updatePendingPayments: true });
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

  it('pago no cartão aplica o plano, grava como cartão e sobe o valor da assinatura', async () => {
    subs.getBusinessBillingContext.mockResolvedValue(ctxCartao());
    await planChangeService.webhookUpgradePix({ id: 'pay_up', status: 'CONFIRMED', value: 50, billingType: 'CREDIT_CARD' }, 'b1', 'premium');
    expect(subs.upsertBillingPayment).toHaveBeenCalledWith(expect.objectContaining({ paymentMethod: 'card', tipo: 'upgrade' }));
    expect(repo.aplicarPlano).toHaveBeenCalledWith('b1', 'premium');
    expect(asaas.atualizarAssinatura).toHaveBeenCalledWith('sub_1', { value: 199.9, updatePendingPayments: true });
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
