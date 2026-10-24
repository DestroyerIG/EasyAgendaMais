import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockSubscriptionRepository = vi.hoisted(() => ({
  getClient: vi.fn(),
  hasProcessedBillingWebhookEvent: vi.fn(),
  getBusinessBillingContext: vi.fn(),
  findByProviderPaymentId: vi.fn(),
  findBillingPaymentByProviderPaymentId: vi.fn(),
  findByProviderSubscriptionId: vi.fn(),
  findByProviderCustomerId: vi.fn(),
  updateSubscriptionState: vi.fn(),
  upsertBillingPayment: vi.fn(),
  storeBillingWebhookEvent: vi.fn(),
}));

const mockBillingProviderFactory = vi.hoisted(() => ({
  getProvider: vi.fn(),
  resolveProviderByPaymentMethod: vi.fn(),
}));

const mockAsaasService = vi.hoisted(() => ({
  resolveBillingPeriodFromPayment: vi.fn(),
}));

const mockAsaasMapper = vi.hoisted(() => ({
  mapAsaasPaymentToPixData: vi.fn(),
  extractBusinessIdFromExternalReference: vi.fn(),
}));

vi.mock('../repositories/subscriptionRepository.js', () => ({
  subscriptionRepository: mockSubscriptionRepository,
}));

vi.mock('../services/billing/billingProviderFactory.js', () => ({
  billingProviderFactory: mockBillingProviderFactory,
}));

vi.mock('../integrations/asaas/service.js', () => ({
  asaasService: mockAsaasService,
}));

vi.mock('../integrations/asaas/mapper.js', () => ({
  asaasMapper: mockAsaasMapper,
}));

const mockPlanChangeService = vi.hoisted(() => ({ webhookUpgradePix: vi.fn() }));

vi.mock('../modules/billing/planChange.service.js', () => ({
  planChangeService: mockPlanChangeService,
}));

vi.mock('../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../config/prisma.js', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(0),
    $transaction: vi.fn(async (cb: unknown) => {
      if (typeof cb === 'function') return (cb as (tx: unknown) => unknown)({});
      return cb;
    }),
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  },
}));

const { billingService } = await import('../services/billingService.js');

describe('webhook Asaas da diferença de upgrade (2D)', () => {
  const evento = (externalReference: string) => ({
    eventId: 'evt_up_1',
    eventType: 'PAYMENT_RECEIVED',
    businessId: 'tenant-up',
    paymentId: 'pay_up',
    subscriptionId: null,
    customerId: 'cus_1',
    externalReference,
    internalStatus: 'active',
    payment: { id: 'pay_up', status: 'RECEIVED', value: 50, externalReference },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ASAAS_WEBHOOK_TOKEN;
    mockSubscriptionRepository.hasProcessedBillingWebhookEvent.mockResolvedValue(false);
    mockSubscriptionRepository.getBusinessBillingContext.mockResolvedValue({ id: 'tenant-up', plan: 'profissional' });
    mockAsaasService.resolveBillingPeriodFromPayment.mockReturnValue({ periodStart: null, periodEnd: null });
    mockAsaasMapper.mapAsaasPaymentToPixData.mockReturnValue(null);
  });

  it('só troca o plano, sem reiniciar o período da mensalidade', async () => {
    mockBillingProviderFactory.getProvider.mockReturnValue({
      handleWebhook: vi.fn().mockResolvedValue(evento('business:tenant-up:plan:premium:upgrade')),
    });

    const r = await billingService.handleAsaasWebhook({ event: 'PAYMENT_RECEIVED' }, {});

    expect(r).toMatchObject({ processed: true, duplicate: false });
    expect(mockPlanChangeService.webhookUpgradePix).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'pay_up' }),
      'tenant-up',
      'premium'
    );
    expect(mockSubscriptionRepository.updateSubscriptionState).not.toHaveBeenCalled();
    expect(mockSubscriptionRepository.storeBillingWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'evt_up_1', status: 'processed' }),
      null
    );
  });

  it('mensalidade comum segue o fluxo de sempre', async () => {
    mockBillingProviderFactory.getProvider.mockReturnValue({
      handleWebhook: vi.fn().mockResolvedValue(evento('business:tenant-up:plan:profissional')),
    });

    await billingService.handleAsaasWebhook({ event: 'PAYMENT_RECEIVED' }, {});

    expect(mockPlanChangeService.webhookUpgradePix).not.toHaveBeenCalled();
    expect(mockSubscriptionRepository.updateSubscriptionState).toHaveBeenCalled();
    expect(mockSubscriptionRepository.upsertBillingPayment).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'mensalidade', plano: 'profissional' }),
      null
    );
  });
});

describe('consulta do Pix da diferença de upgrade (2D)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubscriptionRepository.findBillingPaymentByProviderPaymentId.mockResolvedValue({ business_id: 'tenant-up' });
    mockSubscriptionRepository.getBusinessBillingContext.mockResolvedValue({
      id: 'tenant-up',
      plan: 'profissional',
      provider_customer_id: 'cus_1',
    });
    mockAsaasMapper.extractBusinessIdFromExternalReference.mockReturnValue('tenant-up');
  });

  it('não mexe no período nem no status da assinatura', async () => {
    mockBillingProviderFactory.getProvider.mockReturnValue({
      getPaymentStatus: vi.fn().mockResolvedValue({
        payment: {
          id: 'pay_up',
          status: 'PENDING',
          customer: 'cus_1',
          externalReference: 'business:tenant-up:plan:premium:upgrade',
        },
        pixData: { qrCode: 'qr', pixCopyPaste: 'copia' },
      }),
      mapExternalStatusToInternalStatus: vi.fn().mockReturnValue('pending'),
    });

    const r = await billingService.getPixPaymentStatus('tenant-up', 'pay_up');

    expect(r).toMatchObject({ status: 'pending', pixCopyPaste: 'copia' });
    expect(mockPlanChangeService.webhookUpgradePix).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'pay_up' }),
      'tenant-up',
      'premium'
    );
    expect(mockSubscriptionRepository.updateSubscriptionState).not.toHaveBeenCalled();
  });
});
