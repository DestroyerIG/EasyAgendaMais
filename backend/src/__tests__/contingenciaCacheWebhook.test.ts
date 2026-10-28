import { vi, describe, it, expect, beforeEach } from 'vitest';

// Depois do webhook de pagamento, o estado da conta em cache precisa ser descartado na hora
// (link público, robô e fila voltam sem esperar os 60 s do cache).

const mockRepo = vi.hoisted(() => ({
  hasProcessedEvent: vi.fn(),
  getBusinessBillingContext: vi.fn(),
  findByStripeCustomerId: vi.fn(),
  updateSubscriptionState: vi.fn(),
  storeSubscriptionEvent: vi.fn(),
}));
const mockInvalidar = vi.hoisted(() => vi.fn());
const evento = vi.hoisted(() => ({ atual: null as unknown }));

vi.mock('../repositories/subscriptionRepository.js', () => ({ subscriptionRepository: mockRepo }));
vi.mock('../modules/conta/estadoConta.service.js', () => ({ estadoContaService: { invalidar: mockInvalidar } }));
vi.mock('../config/stripe.js', () => ({
  getStripeClient: () => ({ webhooks: { constructEvent: () => evento.atual } }),
  getStripePriceCatalog: () => ({ recurring: {}, oneTime: {} }),
  getFrontendBaseUrl: () => 'http://localhost:3000',
}));
vi.mock('../services/stripePricingService.js', () => ({
  stripePricingService: { resolvePlanByPriceId: () => null, normalizePaymentMethod: (m: unknown) => m },
}));
vi.mock('../utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const { subscriptionService } = await import('../services/subscriptionService.js');

describe('webhook Stripe limpa o cache do estado da conta', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_teste';
    mockRepo.hasProcessedEvent.mockResolvedValue(false);
    mockRepo.getBusinessBillingContext.mockResolvedValue({ id: 'b1', stripe_payment_mode: 'subscription' });
    mockRepo.updateSubscriptionState.mockResolvedValue({ id: 'b1' });
    mockRepo.storeSubscriptionEvent.mockResolvedValue({ id: 'ev' });
  });

  it('assinatura atualizada para active invalida o negócio', async () => {
    evento.atual = {
      id: 'evt_1',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_1', customer: 'cus_1', status: 'active', metadata: { businessId: 'b1' },
          items: { data: [] }, current_period_start: 1_790_000_000, current_period_end: 1_792_600_000,
        },
      },
    };
    await subscriptionService.handleWebhook('{}', 'assinatura');
    expect(mockRepo.updateSubscriptionState).toHaveBeenCalled();
    expect(mockInvalidar).toHaveBeenCalledWith('b1');
  });

  it('evento repetido não invalida nada', async () => {
    mockRepo.hasProcessedEvent.mockResolvedValue(true);
    evento.atual = { id: 'evt_1', type: 'customer.subscription.updated', data: { object: {} } };
    await subscriptionService.handleWebhook('{}', 'assinatura');
    expect(mockInvalidar).not.toHaveBeenCalled();
  });
});
