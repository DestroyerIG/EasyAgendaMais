import { describe, expect, it } from 'vitest';
import {
  mapAsaasStatusToInternalStatus,
  normalizeInternalSubscriptionStatus,
  resolveBillingProviderFromContext,
} from '../services/billing/statusMapper.js';

describe('billing status mapper', () => {
  it('maps Asaas statuses to internal statuses', () => {
    expect(mapAsaasStatusToInternalStatus('PENDING')).toBe('pending');
    expect(mapAsaasStatusToInternalStatus('RECEIVED')).toBe('active');
    expect(mapAsaasStatusToInternalStatus('CONFIRMED')).toBe('active');
    expect(mapAsaasStatusToInternalStatus('OVERDUE')).toBe('past_due');
    expect(mapAsaasStatusToInternalStatus('CHARGEBACK')).toBe('canceled');
    expect(mapAsaasStatusToInternalStatus('REFUNDED')).toBe('canceled');
    expect(mapAsaasStatusToInternalStatus('SOMETHING_ELSE')).toBe('incomplete');
  });

  it('normalizes internal subscription status safely', () => {
    expect(normalizeInternalSubscriptionStatus('pending')).toBe('pending');
    expect(normalizeInternalSubscriptionStatus('unpaid')).toBe('unpaid');
    expect(normalizeInternalSubscriptionStatus('x')).toBe('incomplete');
    expect(normalizeInternalSubscriptionStatus(undefined)).toBe('incomplete');
  });

  it('resolves provider from explicit or legacy context', () => {
    expect(resolveBillingProviderFromContext({ provider: 'asaas' })).toBe('asaas');
    expect(resolveBillingProviderFromContext({ payment_method: 'pix' })).toBe('asaas');
    expect(resolveBillingProviderFromContext({ payment_method: 'card' })).toBe('asaas');
    expect(resolveBillingProviderFromContext({ provider: 'stripe' })).toBeNull();
    expect(resolveBillingProviderFromContext({})).toBeNull();
  });
});
