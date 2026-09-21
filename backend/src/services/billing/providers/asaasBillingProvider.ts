import { AppError } from '../../../utils/errors.js';
import { asaasService } from '../../../integrations/asaas/service.js';
import { asaasMapper } from '../../../integrations/asaas/mapper.js';
import { mapAsaasStatusToInternalStatus, type InternalSubscriptionStatus } from '../statusMapper.js';

export const asaasBillingProvider = {
  provider: 'asaas' as const,

  async createCustomer({
    business,
    idempotencyKey = null,
    onCustomerResolved = null,
  }: {
    business: Record<string, unknown>;
    idempotencyKey?: string | null;
    onCustomerResolved?: ((customer: unknown) => void) | null;
  }): Promise<unknown> {
    return asaasService.getOrCreateAsaasCustomer({
      business,
      idempotencyKey,
      onCustomerResolved,
    });
  },

  async createSubscription({
    business,
    plan,
    amount,
    idempotencyKey = null,
    onCustomerResolved = null,
  }: {
    business: Record<string, unknown>;
    plan: string;
    amount: number;
    idempotencyKey?: string | null;
    onCustomerResolved?: ((customer: unknown) => void) | null;
  }): Promise<unknown> {
    if (!business) {
      throw new AppError('Negócio inválido para checkout Pix', 400, 'INVALID_BUSINESS');
    }

    return asaasService.createPixSubscription({
      business,
      plan,
      amount,
      idempotencyKey,
      onCustomerResolved,
    });
  },

  async createPixCharge({
    customerId,
    businessId,
    plan,
    amount,
    dueDate,
    description,
    externalReference,
    idempotencyKey = null,
  }: {
    customerId: string;
    businessId: string;
    plan: string;
    amount: number;
    dueDate: string;
    description: string;
    externalReference: string;
    idempotencyKey?: string | null;
  }): Promise<unknown> {
    return asaasService.createPixCharge({
      customerId,
      businessId,
      plan,
      amount,
      dueDate,
      description,
      externalReference,
      idempotencyKey,
    });
  },

  async getPaymentStatus(paymentId: string): Promise<unknown> {
    return asaasService.getPaymentWithPixData(paymentId);
  },

  async cancelSubscription({ subscriptionId }: { subscriptionId: string }): Promise<unknown> {
    return asaasService.cancelSubscription(subscriptionId);
  },

  async reactivateSubscription({ subscriptionId }: { subscriptionId: string }): Promise<unknown> {
    return asaasService.reactivateSubscription(subscriptionId);
  },

  async handleWebhook(payload: unknown): Promise<unknown> {
    return asaasMapper.normalizeAsaasWebhookPayload(payload as import('../../../integrations/asaas/mapper.js').AsaasWebhookPayload);
  },

  mapExternalStatusToInternalStatus(externalStatus: unknown): InternalSubscriptionStatus {
    return mapAsaasStatusToInternalStatus(externalStatus);
  },
};
