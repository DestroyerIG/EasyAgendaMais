import { AppError } from '../../utils/errors.js';
import { asaasBillingProvider } from './providers/asaasBillingProvider.js';
import { stripeBillingProvider } from './providers/stripeBillingProvider.js';

type ProviderName = 'stripe' | 'asaas';
type PaymentMethod = 'card' | 'pix';

const PROVIDERS: Readonly<Record<ProviderName, typeof stripeBillingProvider | typeof asaasBillingProvider>> = Object.freeze({
  stripe: stripeBillingProvider,
  asaas: asaasBillingProvider,
});

// Cartão e Pix vão para o Asaas (o cartão pela página de checkout do Asaas).
const PAYMENT_METHOD_PROVIDER_MAP: Readonly<Record<PaymentMethod, ProviderName>> = Object.freeze({
  card: 'asaas',
  pix: 'asaas',
});

export const billingProviderFactory = {
  getProvider(providerName: string): typeof stripeBillingProvider | typeof asaasBillingProvider {
    const provider = PROVIDERS[providerName as ProviderName];

    if (!provider) {
      throw new AppError('Provider de billing não suportado', 400, 'INVALID_BILLING_PROVIDER');
    }

    return provider;
  },

  resolveProviderByPaymentMethod(paymentMethod: unknown): ProviderName {
    const normalized: string = typeof paymentMethod === 'string' ? paymentMethod.trim().toLowerCase() : '';
    const providerName = Object.hasOwn(PAYMENT_METHOD_PROVIDER_MAP, normalized)
      ? PAYMENT_METHOD_PROVIDER_MAP[normalized as PaymentMethod]
      : undefined;

    if (!providerName) {
      throw new AppError('Método de pagamento inválido', 400, 'INVALID_PAYMENT_METHOD');
    }

    return providerName;
  },

  listProviders(): string[] {
    return Object.keys(PROVIDERS);
  },
};
