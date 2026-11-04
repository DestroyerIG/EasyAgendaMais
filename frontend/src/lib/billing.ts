import api from '@/lib/api';
import type { PlanId } from '@/lib/plans';

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'pending'
  | 'past_due'
  | 'unpaid'
  | 'canceled'
  | 'incomplete';
export type CheckoutPaymentMethod = 'card' | 'pix';
export type BillingProvider = 'asaas' | 'coupon';
export type BillingPaymentMethod = CheckoutPaymentMethod | 'coupon';

/** Cartão: a dona cadastra o cartão na página do Asaas; `cobrancaEm` é a data da 1ª cobrança. */
export interface CheckoutCartaoResponse {
  provider: 'asaas';
  formaPagamento: 'card';
  checkoutUrl: string;
  cobrancaEm: string;
  plan?: PlanId;
}

export interface AppliedCoupon {
  id: string;
  code: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
}

export interface PixCheckoutSessionResponse {
  provider: 'asaas';
  paymentId: string | null;
  subscriptionId: string | null;
  status: SubscriptionStatus;
  plan?: PlanId;
  qrCode: string | null;
  pixCopyPaste: string | null;
  expiresAt: string | null;
  discount?: number;
  coupon?: AppliedCoupon | null;
}

export interface FreeActivationResponse {
  type: 'FREE_ACTIVATION';
  activated: true;
  plan?: PlanId;
}

export type CheckoutSessionResponse =
  | CheckoutCartaoResponse
  | PixCheckoutSessionResponse
  | FreeActivationResponse;

export interface SubscriptionStatusResponse {
  plan: string;
  desiredPlan?: PlanId | string | null;
  provider: BillingProvider | null;
  subscriptionStatus: SubscriptionStatus;
  paymentRequired?: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  nextDueDate?: string | null;
  lastPaymentDate?: string | null;
  canceledAt?: string | null;
  cancelAtPeriodEnd: boolean;
  hasCustomer: boolean;
  paymentMethod?: BillingPaymentMethod | null;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  providerPaymentId?: string | null;
  /** No teste: data da 1ª cobrança se o cartão for cadastrado agora (14 dias do cadastro). */
  cobrancaComCartaoEm?: string | null;
  // Plano e cobrança (2D)
  planoAgendado?: PlanId | null;
  planoAgendadoEm?: string | null;
  upgradePendente?: UpgradePendente | null;
  profissionaisAtivas?: number;
  nomesProfissionais?: string[];
}

export interface UpgradePendente {
  plano: PlanId | null;
  valor: number;
  paymentId: string;
  pixCopyPaste: string | null;
  qrCode: string | null;
  url?: string | null;
}

export type DisponibilidadeRecurso = boolean | 'em_breve' | string;

export interface PlanoCatalogo {
  id: PlanId;
  nome: string;
  preco: number;
  limiteProfissionais: number | null;
  publico: string;
  descricao: string;
  destaques: string[];
  emBreve: string[];
}

export interface RecursoMatriz {
  id: string;
  grupo: string;
  titulo: string;
  basico: DisponibilidadeRecurso;
  profissional: DisponibilidadeRecurso;
  premium: DisponibilidadeRecurso;
}

export interface CatalogoPlanos {
  planos: PlanoCatalogo[];
  matriz: RecursoMatriz[];
}

export type StatusFatura = 'pago' | 'em_aberto' | 'vencido' | 'cancelado' | 'estornado';

export interface Fatura {
  id: string;
  data: string;
  referencia: string;
  periodoInicio: string | null;
  periodoFim: string | null;
  valor: number;
  forma: 'pix' | 'card';
  formaDetalhe: string;
  status: StatusFatura;
  tipo: 'mensalidade' | 'upgrade';
  url: string | null;
}

export interface FaturasResponse {
  anos: number[];
  itens: Fatura[];
}

export type FormaPagamento =
  | { tipo: 'card'; bandeira: string | null; final: string | null; urlFatura: string | null }
  | {
      tipo: 'pix';
      cobrancaAberta: {
        paymentId: string;
        valor: number;
        vencimento: string | null;
        pixCopyPaste: string | null;
        qrCode: string | null;
        url: string | null;
      } | null;
    };

export interface PreviaTroca {
  tipo: 'upgrade' | 'downgrade';
  planoAtual: PlanId;
  planoNovo: PlanId;
  valorHoje: number;
  dias: number;
  valorMensalNovo: number;
  aPartirDe: string | null;
  formaPagamento: 'card' | 'pix';
  bloqueio: { motivo: string } | null;
}

export type ResultadoTroca =
  | { tipo: 'upgrade'; status: 'pago'; plano: PlanId }
  | { tipo: 'upgrade'; status: 'falhou'; motivo: string }
  | {
      tipo: 'upgrade';
      status: 'aguardando';
      plano: PlanId;
      valor: number;
      paymentId: string;
      pixCopyPaste: string | null;
      qrCode: string | null;
      invoiceUrl: string | null;
    }
  | { tipo: 'downgrade'; agendadoPara: string | null; plano: PlanId };

export interface PixPaymentStatusResponse {
  provider: 'asaas';
  paymentId: string;
  subscriptionId: string | null;
  status: SubscriptionStatus;
  externalStatus: string | null;
  qrCode: string | null;
  pixCopyPaste: string | null;
  expiresAt: string | null;
  dueDate?: string | null;
  confirmedDate?: string | null;
}

export interface CouponValidationResponse {
  valid: true;
  discount: number;
  finalAmount: number;
  originalAmount: number;
}

export const billingApi = {
  async createCheckoutSession(
    plan: PlanId,
    paymentMethod: CheckoutPaymentMethod = 'card',
    couponCode?: string | null
  ): Promise<CheckoutSessionResponse> {
    const response = await api.post('/billing/checkout/session', {
      plan,
      paymentMethod,
      couponCode: couponCode || null,
    });
    return response.data;
  },

  async validateCoupon(plan: PlanId, code: string): Promise<CouponValidationResponse> {
    const response = await api.post('/billing/validate-coupon', { plan, code });
    return response.data;
  },

  async getStatus(): Promise<SubscriptionStatusResponse> {
    const response = await api.get('/billing/status');
    return response.data;
  },

  async cancelSubscription(reason?: string): Promise<{
    provider: BillingProvider;
    subscriptionStatus: SubscriptionStatus;
    canceledAt?: string | null;
  }> {
    const payload = reason ? { reason } : {};
    const response = await api.post('/billing/cancel', payload);
    return response.data;
  },

  async reactivateSubscription(reason?: string): Promise<CheckoutSessionResponse & {
    reactivationMode?: 'new_pix_checkout' | 'new_card_checkout' | 'resumed';
  }> {
    const payload = reason ? { reason } : {};
    const response = await api.post('/billing/reactivate', payload);
    return response.data;
  },

  async getPixPaymentStatus(paymentId: string): Promise<PixPaymentStatusResponse> {
    const response = await api.get(`/billing/pix/${encodeURIComponent(paymentId)}`);
    return response.data;
  },

  async getPlans(): Promise<CatalogoPlanos> {
    const response = await api.get('/billing/plans');
    return response.data;
  },

  async getInvoices(ano?: number | null): Promise<FaturasResponse> {
    const response = await api.get('/billing/invoices', { params: ano ? { ano } : {} });
    return response.data;
  },

  async getPaymentMethod(): Promise<FormaPagamento | null> {
    const response = await api.get('/billing/payment-method');
    return response.data;
  },

  async previewPlanChange(plan: PlanId): Promise<PreviaTroca> {
    const response = await api.post('/billing/change-plan/preview', { plan });
    return response.data;
  },

  async changePlan(plan: PlanId): Promise<ResultadoTroca> {
    const response = await api.post('/billing/change-plan', { plan });
    return response.data;
  },

  async cancelPlanChange(): Promise<{ cancelado: 'downgrade' | 'upgrade' }> {
    const response = await api.delete('/billing/change-plan');
    return response.data;
  },
};
