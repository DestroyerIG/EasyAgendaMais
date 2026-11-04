import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const repo = vi.hoisted(() => ({ getSubscriptionStatus: vi.fn() }));
vi.mock('../repositories/subscriptionRepository.js', () => ({ subscriptionRepository: repo }));
vi.mock('../utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../config/prisma.js', () => ({ prisma: { $queryRaw: vi.fn().mockResolvedValue([]) } }));

const { billingService } = await import('../services/billingService.js');

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-03T12:00:00-03:00'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('status no teste: data da primeira cobrança com cartão', () => {
  it('no teste, devolve 14 dias do cadastro', async () => {
    repo.getSubscriptionStatus.mockResolvedValue({
      plan: 'profissional', subscription_status: 'trialing', created_at: new Date('2026-11-01T15:00:00Z'),
      subscription_current_period_end: new Date('2026-11-08T15:00:00Z'),
    });
    const r = await billingService.getStatus('b1');
    expect(r.cobrancaComCartaoEm).toBe('2026-11-15T15:00:00.000Z');
  });

  it('fora do teste, null', async () => {
    repo.getSubscriptionStatus.mockResolvedValue({
      plan: 'basico', subscription_status: 'active', created_at: new Date('2026-10-01T15:00:00Z'),
      subscription_current_period_end: new Date('2026-11-20T15:00:00Z'),
    });
    expect((await billingService.getStatus('b1')).cobrancaComCartaoEm).toBeNull();
  });
});
