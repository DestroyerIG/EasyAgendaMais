import crypto from 'crypto';
import logger from '../utils/logger.js';
import { AppError, NotFoundError, UnauthorizedError } from '../utils/errors.js';
import { prisma } from '../config/prisma.js';
import { Prisma } from '@prisma/client';
import { subscriptionRepository } from '../repositories/subscriptionRepository.js';
import { PLAN_PRICES } from '../config/planCatalog.js';
import { fimDoTesteComCartao } from '../config/trial.js';
import type { PlanId } from '../types/domain.js';
import { planChangeService } from '../modules/billing/planChange.service.js';
import { ehReferenciaUpgrade } from '../modules/billing/planChange.rules.js';
import { estadoContaService } from '../modules/conta/estadoConta.service.js';
import { asaasService, type AsaasPayment, type AsaasBusinessInput } from '../integrations/asaas/service.js';
import { asaasMapper, type AsaasWebhookPayment } from '../integrations/asaas/mapper.js';
import { subscriptionService } from './subscriptionService.js';
import { couponService } from './couponService.js';
import { billingProviderFactory } from './billing/billingProviderFactory.js';
import { stripeBillingProvider as stripeProvider } from './billing/providers/stripeBillingProvider.js';
import { asaasBillingProvider as asaasProvider } from './billing/providers/asaasBillingProvider.js';
import {
  normalizeInternalSubscriptionStatus,
  resolveBillingProviderFromContext,
  type InternalSubscriptionStatus,
} from './billing/statusMapper.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AsaasMetadata {
  billingProvider: 'asaas';
  asaas: {
    eventType: string | null;
    externalStatus: string | null;
    subscriptionId: string | null;
    paymentId: string | null;
    customerId: string | null;
  };
}

interface AsaasPaymentSnapshotInput {
  businessId: string;
  payment: AsaasPayment;
  subscriptionId: string | null;
  internalStatus: InternalSubscriptionStatus;
  pixData?: PixData | null;
  plano?: string | null;
  paymentMethod?: 'card' | 'pix';
  client?: unknown;
}

interface UpdateBusinessFromAsaasPaymentInput {
  business: BusinessBillingContext;
  plan: string;
  payment: AsaasPayment | null | undefined;
  subscriptionId: string | null;
  customerId: string | null;
  internalStatus: InternalSubscriptionStatus;
  eventType?: string | null;
  paymentMethod?: 'card' | 'pix';
  client?: unknown;
}

interface BusinessBillingContext {
  id: string;
  name?: string | null;
  email?: string | null;
  plan?: string | null;
  desired_plan?: string | null;
  subscription_status?: string | null;
  payment_method?: string | null;
  provider?: string | null;
  provider_customer_id?: string | null;
  stripe_customer_id?: string | null;
  provider_subscription_id?: string | null;
  stripe_subscription_id?: string | null;
  provider_payment_id?: string | null;
  [key: string]: unknown;
}

interface PixData {
  qrCode: string | null;
  pixCopyPaste: string | null;
  expiresAt: string | null;
  dueDate?: string | null;
  confirmedDate?: string | null;
}

interface AppliedCoupon {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
}

interface NormalizedWebhookPayload {
  eventId: string;
  eventType: string;
  externalStatus: string | null;
  internalStatus: InternalSubscriptionStatus;
  paymentId: string | null;
  subscriptionId: string | null;
  customerId: string | null;
  externalReference: string | null;
  businessId: string | null;
  amount: number | null;
  dueDate: string | null;
  confirmedDate: string | null;
  formaPagamento: 'card' | 'pix';
  checkoutSession: string | null;
  payment: AsaasWebhookPayment;
}

type PlanName = 'basico' | 'profissional' | 'premium';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_PLANS = new Set(['basico', 'profissional', 'premium']);
const VALID_PAYMENT_METHODS = new Set(['card', 'pix']);
const SAFE_WEBHOOK_TOKEN_HEADERS = [
  'asaas-access-token',
  'x-asaas-access-token',
  'x-webhook-token',
  'authorization',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const parseDate = (value: unknown): Date | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsed = new Date(value as string);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const resolveAsaasWebhookToken = (headers: Record<string, unknown> = {}): string | null => {
  for (const headerName of SAFE_WEBHOOK_TOKEN_HEADERS) {
    const raw =
      headers[headerName] ||
      headers[headerName.toLowerCase()] ||
      headers[headerName.toUpperCase()];

    if (!raw) {
      continue;
    }

    if (headerName === 'authorization' && typeof raw === 'string') {
      const match = raw.match(/^Bearer\s+(.+)$/i);
      if (match?.[1]) {
        return match[1].trim();
      }

      return raw.trim();
    }

    if (typeof raw === 'string') {
      return raw.trim();
    }

    if (Array.isArray(raw) && raw.length > 0) {
      return String(raw[0]).trim();
    }
  }

  return null;
};

const resolvePlanFromExternalReference = (externalReference: unknown): string | null => {
  if (typeof externalReference !== 'string' || externalReference.trim().length === 0) {
    return null;
  }

  const match = externalReference.match(/plan:([a-z_]+)/i);
  if (!match?.[1]) {
    return null;
  }

  const normalized = match[1].toLowerCase();
  return VALID_PLANS.has(normalized) ? normalized : null;
};

const resolveCheckoutPlanFromBusiness = (business: Partial<BusinessBillingContext>): string => {
  const desiredPlan = String(business?.desired_plan || '').trim().toLowerCase();
  const currentPlan = String(business?.plan || '').trim().toLowerCase();

  if (VALID_PLANS.has(desiredPlan)) {
    return desiredPlan;
  }

  if (VALID_PLANS.has(currentPlan)) {
    return currentPlan;
  }

  return 'basico';
};

const ASAAS_CUSTOMER_FAILURE_CODES = new Set([
  'ASAAS_CUSTOMER_CREATE_ERROR',
  'ASAAS_CUSTOMER_UPDATE_ERROR',
]);

const isAsaasCustomerCreationFailure = (error: unknown): boolean => {
  const err = error as { code?: string; providerData?: { path?: string } } | null;
  const code = String(err?.code || '').trim().toUpperCase();
  if (ASAAS_CUSTOMER_FAILURE_CODES.has(code)) {
    return true;
  }

  const providerPath = String(err?.providerData?.path || '').trim().toLowerCase();
  if (providerPath === '/customers' || providerPath.startsWith('/customers/')) {
    return true;
  }

  return false;
};

const hasActivePaymentEvidence = (
  data: Record<string, unknown>,
  _provider: string | null
): boolean => {
  const status = normalizeInternalSubscriptionStatus(data?.subscription_status);

  // DB subscription_status is the source of truth.
  // 'active' or 'trialing' in the database means the subscription is valid —
  // webhook, admin activation, or coupon already confirmed it.
  return status === 'active' || status === 'trialing';
};

const buildAsaasMetadata = (payload: {
  eventType?: string | null;
  externalStatus?: string | null;
  subscriptionId?: string | null;
  paymentId?: string | null;
  customerId?: string | null;
} = {}): AsaasMetadata => {
  return {
    billingProvider: 'asaas',
    asaas: {
      eventType: payload.eventType || null,
      externalStatus: payload.externalStatus || null,
      subscriptionId: payload.subscriptionId || null,
      paymentId: payload.paymentId || null,
      customerId: payload.customerId || null,
    },
  };
};

const saveAsaasPaymentSnapshot = async ({
  businessId,
  payment,
  subscriptionId,
  internalStatus,
  pixData,
  plano = null,
  paymentMethod = 'pix',
  client = null,
}: AsaasPaymentSnapshotInput): Promise<unknown> => {
  if (!payment?.id) {
    return null;
  }

  return subscriptionRepository.upsertBillingPayment(
    {
      businessId,
      provider: 'asaas',
      providerPaymentId: payment.id,
      providerSubscriptionId: subscriptionId || payment.subscription || null,
      paymentMethod,
      externalStatus: payment.status || null,
      internalStatus,
      amount: typeof payment.value === 'number' ? payment.value : null,
      dueDate: parseDate(payment.dueDate),
      paidAt: parseDate(payment.confirmedDate || payment.clientPaymentDate || payment.paymentDate),
      pixCopyPaste: pixData?.pixCopyPaste || null,
      qrCode: pixData?.qrCode || null,
      tipo: 'mensalidade',
      plano,
      metadata: {
        rawPayment: payment,
      },
    },
    client
  );
};

const updateBusinessFromAsaasPayment = async ({
  business,
  plan,
  payment,
  subscriptionId,
  customerId,
  internalStatus,
  eventType = null,
  paymentMethod = 'pix',
  client = null,
}: UpdateBusinessFromAsaasPaymentInput): Promise<unknown> => {
  const { periodStart, periodEnd } = asaasService.resolveBillingPeriodFromPayment(
    payment as AsaasWebhookPayment | null | undefined
  );
  const dueDate = parseDate(payment?.dueDate);
  const paidAt = parseDate(
    payment?.confirmedDate || payment?.clientPaymentDate || payment?.paymentDate
  );

  const atualizado = await subscriptionRepository.updateSubscriptionState(
    business.id,
    {
      plan,
      paymentMethod,
      subscriptionStatus: internalStatus,
      cancelAtPeriodEnd: internalStatus === 'canceled',
      provider: 'asaas',
      providerCustomerId: customerId,
      providerSubscriptionId: subscriptionId,
      providerPaymentId: payment?.id || null,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      nextDueDate: dueDate,
      lastPaymentDate: paidAt,
      canceledAt: internalStatus === 'canceled' ? new Date() : null,
      metadata: buildAsaasMetadata({
        eventType,
        externalStatus: payment?.status,
        subscriptionId,
        paymentId: payment?.id,
        customerId,
      }),
    },
    client
  );
  // Webhook ou "Já paguei": o status mudou, então o estado da conta em cache cai na hora.
  estadoContaService.invalidar(business.id);
  return atualizado;
};

const resolveAsaasWebhookBusiness = async (
  normalizedPayload: NormalizedWebhookPayload,
  client: unknown = null
): Promise<BusinessBillingContext | null> => {
  if (normalizedPayload.businessId) {
    return subscriptionRepository.getBusinessBillingContext(
      normalizedPayload.businessId,
      client
    ) as Promise<BusinessBillingContext | null>;
  }

  if (normalizedPayload.paymentId) {
    const byProviderPayment = await subscriptionRepository.findByProviderPaymentId(
      'asaas',
      normalizedPayload.paymentId,
      client
    );

    if (byProviderPayment) {
      return byProviderPayment as BusinessBillingContext;
    }

    const paymentSnapshot = await subscriptionRepository.findBillingPaymentByProviderPaymentId(
      'asaas',
      normalizedPayload.paymentId,
      client
    );

    const snapshot = paymentSnapshot as { business_id?: string } | null;
    if (snapshot?.business_id) {
      return subscriptionRepository.getBusinessBillingContext(
        snapshot.business_id,
        client
      ) as Promise<BusinessBillingContext | null>;
    }
  }

  if (normalizedPayload.subscriptionId) {
    const byProviderSubscription = await subscriptionRepository.findByProviderSubscriptionId(
      'asaas',
      normalizedPayload.subscriptionId,
      client
    );

    if (byProviderSubscription) {
      return byProviderSubscription as BusinessBillingContext;
    }
  }

  // Cartão: a 1ª cobrança chega sem externalReference; o negócio é o dono do checkout.
  if (normalizedPayload.checkoutSession) {
    const byCheckout = await subscriptionRepository.findByCheckoutCartao(normalizedPayload.checkoutSession, client);
    if (byCheckout) {
      return byCheckout as BusinessBillingContext;
    }
  }

  if (normalizedPayload.customerId) {
    return subscriptionRepository.findByProviderCustomerId(
      'asaas',
      normalizedPayload.customerId,
      client
    ) as Promise<BusinessBillingContext | null>;
  }

  return null;
};

// ---------------------------------------------------------------------------
// Exported service
// ---------------------------------------------------------------------------

const dataOuNull = (valor: unknown): Date | null => {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(String(valor));
  return Number.isNaN(d.getTime()) ? null : d;
};

const metadataDe = (business: BusinessBillingContext): Record<string, unknown> =>
  business.metadata && typeof business.metadata === 'object' ? (business.metadata as Record<string, unknown>) : {};

/** Plano da cobrança de cartão: o do externalReference, senão o escolhido no checkout, senão o atual. */
const planoDoCartao = (business: BusinessBillingContext, payload: NormalizedWebhookPayload): string => {
  const checkout = metadataDe(business).checkoutCartao as { plano?: string } | undefined;
  return resolvePlanFromExternalReference(payload.externalReference) || checkout?.plano || business.plan || 'basico';
};

const vencimentoAoMeioDia = (dueDate: unknown): Date | null => {
  if (typeof dueDate !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(dueDate)) return null;
  return new Date(`${dueDate.slice(0, 10)}T12:00:00Z`);
};

/**
 * Cobrança de cartão do Asaas, antes do fluxo genérico:
 * - guarda o cartão (token, bandeira, final) para reativar sem digitar de novo;
 * - aplica o desconto do cupom na 1ª cobrança ainda pendente e futura (com vencimento hoje o
 *   cartão já foi cobrado; o desconto fica para a próxima);
 * - no teste, a 1ª cobrança liga o cartão e leva o fim do teste até o vencimento dela.
 * Devolve true quando a cobrança foi tratada como cartão no teste (o status não muda).
 */
const tratarCobrancaCartao = async (
  business: BusinessBillingContext,
  payload: NormalizedWebhookPayload
): Promise<boolean> => {
  const payment = payload.payment;
  const metadata = metadataDe(business);
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const pendenteFutura =
    payment.status === 'PENDING' && typeof payment.dueDate === 'string' && payment.dueDate.slice(0, 10) > hoje;

  if (payload.subscriptionId && !metadata.cartao) {
    try {
      const assinatura = await asaasService.buscarAssinatura(payload.subscriptionId);
      const cc = assinatura?.creditCard;
      if (cc?.creditCardToken) {
        await subscriptionRepository.mesclarMetadataCobranca(business.id, {
          cartao: { token: cc.creditCardToken, bandeira: cc.creditCardBrand ?? null, final: cc.creditCardNumber ?? null },
        });
      }
    } catch (error) {
      logger.warn({ err: error, businessId: business.id }, 'Não foi possível ler o cartão da assinatura no Asaas');
    }
  }

  const desconto = metadata.descontoPrimeiraMensalidade as { valor?: number } | null | undefined;
  if (desconto?.valor && pendenteFutura && payment.id && typeof payment.value === 'number') {
    const valor = Number(Math.max(5, payment.value - desconto.valor).toFixed(2));
    await asaasService.atualizarCobranca(payment.id, { value: valor });
    await subscriptionRepository.mesclarMetadataCobranca(business.id, { descontoPrimeiraMensalidade: null });
  }

  const fimDoTeste = dataOuNull(business.subscription_current_period_end);
  const emTeste = business.subscription_status === 'trialing' && !!fimDoTeste && fimDoTeste.getTime() > Date.now();
  const vencimento = vencimentoAoMeioDia(payment.dueDate);
  if (!emTeste || !pendenteFutura || !payload.subscriptionId || !vencimento) {
    return false;
  }

  await subscriptionRepository.ligarCartaoNoTeste(business.id, {
    subscriptionId: payload.subscriptionId,
    customerId: payload.customerId,
    fimDoTeste: vencimento,
  });
  await saveAsaasPaymentSnapshot({
    businessId: business.id,
    payment: payment as unknown as AsaasPayment,
    subscriptionId: payload.subscriptionId,
    internalStatus: payload.internalStatus,
    pixData: null,
    plano: planoDoCartao(business, payload),
    paymentMethod: 'card',
    client: null,
  });
  estadoContaService.invalidar(business.id);
  return true;
};

/**
 * Cartão pelo Checkout Asaas. Durante o teste a primeira cobrança fica para o fim do teste com
 * cartão (14 dias do cadastro, sem encurtar teste estendido); fora do teste, cobra hoje.
 * A assinatura nasce com o valor cheio: o cupom vale só na primeira mensalidade, aplicada pelo
 * webhook na primeira cobrança (metadata.descontoPrimeiraMensalidade).
 */
const criarCheckoutCartao = async ({
  business,
  plan,
  valorCheio,
  desconto,
  cupom,
  couponCode,
}: {
  business: BusinessBillingContext;
  plan: PlanId;
  valorCheio: number;
  desconto: number;
  cupom: AppliedCoupon | null;
  couponCode: string | null;
}): Promise<Record<string, unknown>> => {
  const agora = new Date();
  const fimDoTeste = dataOuNull(business.subscription_current_period_end);
  const emTeste = business.subscription_status === 'trialing' && !!fimDoTeste && fimDoTeste.getTime() > agora.getTime();
  const criadoEm = dataOuNull(business.created_at) ?? agora;
  const nextDueDate = emTeste ? fimDoTesteComCartao(criadoEm, fimDoTeste) : agora;
  const base = process.env.FRONTEND_URL || 'http://localhost:3000';

  const checkout = await asaasService.criarCheckoutCartao({
    business,
    plan,
    valor: valorCheio,
    nextDueDate,
    urlRetorno: `${base}/dashboard/planos?cartao=retorno`,
  });

  await subscriptionRepository.mesclarMetadataCobranca(business.id, {
    checkoutCartao: { id: checkout.checkoutId, plano: plan, criadoEm: agora.toISOString() },
    ...(desconto > 0 ? { descontoPrimeiraMensalidade: { valor: desconto, cupom: cupom?.code ?? couponCode } } : {}),
  });
  if (cupom) {
    await couponService.validateAndApply(couponCode ?? '', valorCheio);
  }

  logger.info(
    { businessId: business.id, plan, emTeste, nextDueDate: nextDueDate.toISOString(), reason: 'card_checkout_created' },
    'Checkout de cartão do Asaas criado'
  );

  return {
    provider: 'asaas',
    formaPagamento: 'card',
    checkoutUrl: checkout.url,
    cobrancaEm: nextDueDate.toISOString(),
    plan,
  };
};

export const billingService = {
  async createCheckoutSession(
    businessId: string,
    plan: string,
    paymentMethod: string,
    couponCode: string | null = null
  ): Promise<Record<string, unknown>> {
    logger.info(
      {
        event: 'billing_checkout_start',
        businessId,
        plan,
        paymentMethod,
      },
      'Iniciando checkout de billing'
    );

    try {
      if (!VALID_PAYMENT_METHODS.has(paymentMethod)) {
        throw new AppError(
          'Método de pagamento inválido para checkout',
          400,
          'INVALID_PAYMENT_METHOD'
        );
      }

      const business = (await subscriptionRepository.getBusinessBillingContext(
        businessId
      )) as BusinessBillingContext | null;

      if (!business) {
        throw new NotFoundError('Negócio');
      }

      const fallbackPlan = resolveCheckoutPlanFromBusiness(business);
      const requestedPlan = String(plan || '').trim().toLowerCase();

      if (requestedPlan && !VALID_PLANS.has(requestedPlan)) {
        throw new AppError('Plano inválido para checkout', 400, 'INVALID_PLAN');
      }

      // Honra o plano escolhido pelo usuário no checkout. Só recorre ao
      // desired_plan/plan salvo quando nenhum plano válido é enviado na requisição.
      const checkoutPlan =
        requestedPlan && VALID_PLANS.has(requestedPlan) ? requestedPlan : fallbackPlan;

      // Mantém o desired_plan sincronizado com a escolha do checkout para que o
      // status de billing e a tela de pagamento reflitam o plano correto.
      if (checkoutPlan !== fallbackPlan) {
        await subscriptionRepository.setDesiredPlan(businessId, checkoutPlan);
        logger.info(
          {
            businessId,
            requestedPlan: checkoutPlan,
            previousDesiredPlan: fallbackPlan,
            subscriptionStatus: business.subscription_status,
            reason: 'desired_plan_updated_from_checkout',
          },
          'desired_plan atualizado a partir do plano selecionado no checkout'
        );
      }

      const providerName = billingProviderFactory.resolveProviderByPaymentMethod(paymentMethod);
      const provider = billingProviderFactory.getProvider(providerName);

      const baseAmount = PLAN_PRICES[checkoutPlan as PlanName] ?? PLAN_PRICES.basico;
      const {
        finalAmount: rawFinalAmount,
        discount: rawDiscount,
        coupon: appliedCoupon,
      } = (await couponService.validate(couponCode ?? '', baseAmount)) as {
        finalAmount: number;
        discount: number;
        coupon: AppliedCoupon | null;
      };

      let finalAmount = rawFinalAmount;
      let discount = rawDiscount;

      if (finalAmount > 0 && finalAmount < 5) {
        finalAmount = 5;
        discount = Number((baseAmount - finalAmount).toFixed(2));
      }

      if (finalAmount === 0) {
        const activationCouponCode = appliedCoupon?.code || couponCode || null;

        await subscriptionRepository.updateSubscriptionState(businessId, {
          plan: checkoutPlan,
          paymentMethod: 'coupon',
          subscriptionStatus: 'active',
          provider: 'coupon',
          cancelAtPeriodEnd: false,
        });

        // Consumir cupom somente após ativação bem-sucedida
        if (appliedCoupon) {
          await couponService.validateAndApply(couponCode ?? '', baseAmount);
        }

        logger.info(
          {
            email: business.email,
            businessId,
            desiredPlan: checkoutPlan,
            subscriptionStatus: 'active',
            paymentRequired: false,
            checkoutCreated: false,
            paymentProvider: 'coupon',
            reason: 'coupon_free_activation',
            couponCode: activationCouponCode,
          },
          'Ativacao gratuita aplicada via cupom'
        );

        return {
          type: 'FREE_ACTIVATION',
          activated: true,
          plan: checkoutPlan,
        };
      }

      if (paymentMethod === 'card') {
        return await criarCheckoutCartao({
          business,
          plan: checkoutPlan as PlanId,
          valorCheio: baseAmount,
          desconto: discount,
          cupom: appliedCoupon,
          couponCode,
        });
      }

      const idempotencyKey = `pix-checkout:${businessId}:${plan}:${crypto.randomUUID()}`;
      const pixCheckout = await (provider as typeof asaasProvider).createSubscription({
        business,
        plan: checkoutPlan,
        amount: finalAmount,
        idempotencyKey,
        onCustomerResolved: (customer: unknown) =>
          subscriptionRepository.setAsaasCustomerId(businessId, customer as string),
      });

      // Consumir cupom somente após checkout Asaas bem-sucedido
      if (appliedCoupon) {
        await couponService.validateAndApply(couponCode ?? '', baseAmount);
      }

      const pxCheckout = pixCheckout as {
        payment?: AsaasPayment | null;
        subscription?: { id?: string } | null;
        customer?: { id?: string } | null;
        pixData?: PixData | null;
      };

      const payment = pxCheckout.payment || null;
      const mappedStatus = provider.mapExternalStatusToInternalStatus(payment?.status);
      const internalStatus: InternalSubscriptionStatus =
        mappedStatus === 'active' ? 'pending' : (mappedStatus as InternalSubscriptionStatus);
      const resolvedPlan =
        resolvePlanFromExternalReference(payment?.externalReference) || checkoutPlan;

      await updateBusinessFromAsaasPayment({
        business,
        plan: resolvedPlan,
        payment: payment as AsaasPayment,
        subscriptionId:
          pxCheckout.subscription?.id || payment?.subscription || null,
        customerId: pxCheckout.customer?.id || null,
        internalStatus,
        eventType: 'checkout.pix.created',
      });

      await saveAsaasPaymentSnapshot({
        businessId,
        payment: payment as AsaasPayment,
        subscriptionId:
          pxCheckout.subscription?.id || payment?.subscription || null,
        internalStatus,
        pixData: pxCheckout.pixData,
        plano: resolvedPlan,
      });

      logger.info(
        {
          email: business.email,
          businessId,
          desiredPlan: resolvedPlan,
          subscriptionStatus: internalStatus,
          paymentRequired: internalStatus !== 'active',
          checkoutCreated: true,
          paymentProvider: 'asaas',
          reason: 'pix_checkout_created',
        },
        'Checkout de onboarding criado'
      );

      return {
        provider: 'asaas',
        paymentId: payment?.id || null,
        subscriptionId:
          pxCheckout.subscription?.id || payment?.subscription || null,
        invoiceUrl: payment?.invoiceUrl || null,
        bankSlipUrl: payment?.bankSlipUrl || null,
        status: internalStatus,
        plan: resolvedPlan,
        pixQrCode: pxCheckout.pixData?.qrCode || null,
        qrCode: pxCheckout.pixData?.qrCode || null,
        pixCopyPaste: pxCheckout.pixData?.pixCopyPaste || null,
        expiresAt: pxCheckout.pixData?.expiresAt || null,
        discount,
        coupon: appliedCoupon
          ? {
              id: appliedCoupon.id,
              code: appliedCoupon.code,
              discountType: appliedCoupon.discount_type,
              discountValue: appliedCoupon.discount_value,
            }
          : null,
      };
    } catch (error) {
      const traceCode = `billing-checkout:${crypto.randomUUID()}`;

      const err = error as {
        code?: string;
        statusCode?: number;
        providerStatus?: number;
        providerData?: unknown;
      } | null;

      logger.error(
        {
          event: 'billing_checkout_error',
          traceCode,
          businessId,
          plan,
          paymentMethod,
          code: err?.code || null,
          statusCode: err?.statusCode || null,
          providerStatus: err?.providerStatus || null,
          providerData: err?.providerData || null,
        },
        'Falha ao criar checkout de billing'
      );

      const normalizedPaymentMethod = String(paymentMethod || '').trim().toLowerCase();
      if (normalizedPaymentMethod === 'pix' && isAsaasCustomerCreationFailure(error)) {
        const controlledError = new AppError(
          'Não foi possível criar o cliente no Asaas. Verifique os dados cadastrais e tente novamente.',
          400,
          'ASAAS_CUSTOMER_CREATE_ERROR'
        ) as AppError & {
          details?: unknown;
          providerStatus?: number | null;
          providerData?: unknown;
          providerHeaders?: unknown;
        };

        controlledError.details = { traceCode };
        controlledError.providerStatus = err?.providerStatus || err?.statusCode || null;
        controlledError.providerData = err?.providerData || null;
        controlledError.providerHeaders = (error as { providerHeaders?: unknown })?.providerHeaders || null;

        throw controlledError;
      }

      throw error;
    }
  },

  async getStatus(businessId: string): Promise<Record<string, unknown>> {
    let data = (await subscriptionRepository.getSubscriptionStatus(
      businessId
    )) as Record<string, unknown> | null;

    if (!data) {
      throw new NotFoundError('Negócio');
    }

    let provider = resolveBillingProviderFromContext(data);
    let subscriptionStatus = normalizeInternalSubscriptionStatus(data.subscription_status);

    if (
      provider === 'stripe' &&
      data.payment_method === 'card' &&
      subscriptionStatus === 'pending'
    ) {
      try {
        const synced = await subscriptionService.resyncBusinessSubscription(businessId);
        data = (await subscriptionRepository.getSubscriptionStatus(
          businessId
        )) as Record<string, unknown>;
        provider = resolveBillingProviderFromContext(data);
        subscriptionStatus = normalizeInternalSubscriptionStatus(data.subscription_status);

        logger.info(
          {
            event: 'stripe_subscription_synced',
            businessId,
            subscriptionStatus: synced.subscriptionStatus,
            source: 'billing_status_refresh',
          },
          'Assinatura Stripe sincronizada ao consultar status'
        );
      } catch (error) {
        const err = error as { code?: string; message?: string } | null;
        logger.warn(
          {
            event: 'stripe_webhook_error',
            businessId,
            code: err?.code || null,
            message: err?.message || null,
            source: 'billing_status_refresh',
          },
          'Falha ao sincronizar assinatura Stripe ao consultar status'
        );
      }
    }

    const paymentRequired = !hasActivePaymentEvidence(data, provider);

    return {
      plan: data.plan,
      desiredPlan: resolveCheckoutPlanFromBusiness(data as Partial<BusinessBillingContext>),
      provider,
      paymentMethod: data.payment_method || null,
      subscriptionStatus,
      paymentRequired,
      currentPeriodStart:
        data.current_period_start || data.subscription_current_period_start,
      currentPeriodEnd:
        data.current_period_end || data.subscription_current_period_end,
      nextDueDate:
        data.next_due_date ||
        data.current_period_end ||
        data.subscription_current_period_end,
      lastPaymentDate: data.last_payment_date || null,
      canceledAt: data.canceled_at || null,
      cancelAtPeriodEnd: Boolean(data.subscription_cancel_at_period_end),
      hasCustomer: Boolean(data.provider_customer_id || data.stripe_customer_id),
      paymentMode: data.stripe_payment_mode || null,
      providerCustomerId:
        data.provider_customer_id || data.stripe_customer_id || null,
      providerSubscriptionId:
        data.provider_subscription_id || data.stripe_subscription_id || null,
      providerPaymentId: data.provider_payment_id || null,
      metadata: data.metadata || null,
    };
  },

  async cancelSubscription(businessId: string): Promise<Record<string, unknown>> {
    const context = (await subscriptionRepository.getBusinessBillingContext(
      businessId
    )) as BusinessBillingContext | null;

    if (!context) {
      throw new NotFoundError('Negócio');
    }

    const providerName = resolveBillingProviderFromContext(
      context as unknown as Record<string, unknown>
    );

    if (!providerName) {
      throw new AppError(
        'Nenhum provider de billing vinculado à conta',
        400,
        'BILLING_PROVIDER_NOT_SET'
      );
    }

    const provider = billingProviderFactory.getProvider(providerName);

    if (providerName === 'stripe') {
      return (provider as typeof stripeProvider).cancelSubscription({ businessId, context }) as unknown as Promise<Record<string, unknown>>;
    }

    if (context.provider_subscription_id) {
      await (provider as typeof asaasProvider).cancelSubscription({
        subscriptionId: context.provider_subscription_id as string,
      });
    }

    // Pix é cobrança mês a mês: cancelar só impede a próxima. O acesso continua até o fim
    // do período pago (spec 2D), quando a rotina de expiração marca 'canceled'. Sem período
    // pago (pendente, atrasada), cancela na hora.
    const status = normalizeInternalSubscriptionStatus(context.subscription_status);
    const fimPeriodo = parseDate(context.current_period_end ?? context.subscription_current_period_end);
    const mantemAcesso = status === 'active' && Boolean(fimPeriodo && fimPeriodo.getTime() > Date.now());
    const canceledAt = new Date();

    await subscriptionRepository.updateSubscriptionState(businessId, {
      provider: 'asaas',
      paymentMethod: 'pix',
      subscriptionStatus: mantemAcesso ? 'active' : 'canceled',
      canceledAt,
      cancelAtPeriodEnd: true,
      metadata: {
        billingProvider: 'asaas',
        cancelSource: 'manual_action',
      },
    });

    return {
      provider: 'asaas',
      subscriptionStatus: mantemAcesso ? 'active' : 'canceled',
      cancelAtPeriodEnd: true,
      currentPeriodEnd: mantemAcesso ? fimPeriodo!.toISOString() : null,
      canceledAt: canceledAt.toISOString(),
    };
  },

  async reactivateSubscription(businessId: string): Promise<Record<string, unknown>> {
    const context = (await subscriptionRepository.getBusinessBillingContext(
      businessId
    )) as BusinessBillingContext | null;

    if (!context) {
      throw new NotFoundError('Negócio');
    }

    const providerName = resolveBillingProviderFromContext(
      context as unknown as Record<string, unknown>
    );

    if (!providerName) {
      throw new AppError(
        'Nenhum provider de billing vinculado à conta',
        400,
        'BILLING_PROVIDER_NOT_SET'
      );
    }

    const provider = billingProviderFactory.getProvider(providerName);

    if (providerName === 'stripe') {
      return (provider as typeof stripeProvider).reactivateSubscription({
        businessId,
        context,
      }) as unknown as Promise<Record<string, unknown>>;
    }

    // Pix cancelado que ainda está no período pago: só desfaz o cancelamento.
    if (
      normalizeInternalSubscriptionStatus(context.subscription_status) === 'active' &&
      context.subscription_cancel_at_period_end
    ) {
      await subscriptionRepository.updateSubscriptionState(businessId, {
        provider: 'asaas',
        cancelAtPeriodEnd: false,
      });
      return { provider: 'asaas', subscriptionStatus: 'active', reactivationMode: 'resumed' };
    }

    // Com downgrade agendado, a próxima cobrança Pix já sai no plano novo.
    const plan = (context.plano_agendado as string | null) || context.plan || 'basico';
    const checkout = await this.createCheckoutSession(businessId, plan, 'pix');

    return {
      ...checkout,
      reactivationMode: 'new_pix_checkout',
    };
  },

  async getPixPaymentStatus(
    businessId: string,
    paymentId: string
  ): Promise<Record<string, unknown>> {
    const existingPayment = (await subscriptionRepository.findBillingPaymentByProviderPaymentId(
      'asaas',
      paymentId
    )) as { business_id?: string } | null;

    if (existingPayment && existingPayment.business_id !== businessId) {
      throw new UnauthorizedError('Cobrança Pix não pertence ao negócio autenticado');
    }

    const provider = billingProviderFactory.getProvider('asaas');
    const paymentResult = (await provider.getPaymentStatus(paymentId)) as {
      payment: AsaasPayment;
      pixData: PixData | null;
    };

    const payment = paymentResult.payment;
    const internalStatus = provider.mapExternalStatusToInternalStatus(
      payment?.status
    ) as InternalSubscriptionStatus;

    const business = (await subscriptionRepository.getBusinessBillingContext(
      businessId
    )) as BusinessBillingContext | null;

    if (!business) {
      throw new NotFoundError('Negócio');
    }

    const paymentBusinessId = asaasMapper.extractBusinessIdFromExternalReference(
      payment?.externalReference
    );

    if (paymentBusinessId && paymentBusinessId !== businessId) {
      throw new UnauthorizedError('Cobrança Pix não pertence ao negócio autenticado');
    }

    if (
      payment?.customer &&
      business.provider_customer_id &&
      payment.customer !== business.provider_customer_id
    ) {
      throw new UnauthorizedError('Cobrança Pix não pertence ao negócio autenticado');
    }

    const resolvedPlan =
      resolvePlanFromExternalReference(payment?.externalReference) || business.plan || 'basico';

    if (ehReferenciaUpgrade(payment?.externalReference)) {
      // Diferença de upgrade (2D): a consulta não pode tratar como mensalidade (reiniciaria
      // o período e marcaria a assinatura como pendente enquanto o Pix não é pago).
      await planChangeService.webhookUpgradePix(
        payment as unknown as Record<string, unknown>,
        businessId,
        resolvedPlan as PlanName
      );
    } else {
      await updateBusinessFromAsaasPayment({
        business,
        plan: resolvedPlan,
        payment,
        subscriptionId:
          payment?.subscription || business.provider_subscription_id || null,
        customerId:
          payment?.customer || business.provider_customer_id || null,
        internalStatus,
        eventType: 'pix.status.refresh',
      });

      await saveAsaasPaymentSnapshot({
        businessId,
        payment,
        subscriptionId:
          payment?.subscription || business.provider_subscription_id || null,
        internalStatus,
        pixData: paymentResult.pixData,
        plano: resolvedPlan,
      });
    }

    return {
      provider: 'asaas',
      paymentId: payment?.id || paymentId,
      subscriptionId: payment?.subscription || null,
      status: internalStatus,
      externalStatus: payment?.status || null,
      qrCode: paymentResult.pixData?.qrCode || null,
      pixCopyPaste: paymentResult.pixData?.pixCopyPaste || null,
      expiresAt: paymentResult.pixData?.expiresAt || null,
      dueDate: paymentResult.pixData?.dueDate || null,
      confirmedDate: paymentResult.pixData?.confirmedDate || null,
    };
  },

  validateAsaasWebhook(headers: Record<string, unknown> = {}): true {
    const configuredToken = process.env.ASAAS_WEBHOOK_TOKEN;

    if (!configuredToken) {
      return true;
    }

    const token = resolveAsaasWebhookToken(headers);

    if (!token) {
      throw new UnauthorizedError('Assinatura do webhook Asaas inválida');
    }

    const tokenBuffer = Buffer.from(token, 'utf8');
    const configuredBuffer = Buffer.from(configuredToken, 'utf8');

    if (
      tokenBuffer.length !== configuredBuffer.length ||
      !crypto.timingSafeEqual(tokenBuffer, configuredBuffer)
    ) {
      throw new UnauthorizedError('Assinatura do webhook Asaas inválida');
    }

    return true;
  },

  async handleAsaasWebhook(
    payload: Record<string, unknown>,
    headers: Record<string, unknown> = {}
  ): Promise<{ processed: boolean; duplicate?: boolean; eventType?: string }> {
    this.validateAsaasWebhook(headers);

    const provider = billingProviderFactory.getProvider('asaas') as typeof asaasProvider;
    const normalizedPayload = (await provider.handleWebhook(
      payload
    )) as NormalizedWebhookPayload;

    const lockKey = `billing:asaas:${normalizedPayload.eventId}`;
    await prisma.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);

    try {
      const alreadyProcessed =
        await subscriptionRepository.hasProcessedBillingWebhookEvent(
          'asaas',
          normalizedPayload.eventId,
          null
        );

      if (alreadyProcessed) {
        return {
          processed: false,
          duplicate: true,
          eventType: normalizedPayload.eventType,
        };
      }

      const business = await resolveAsaasWebhookBusiness(normalizedPayload, null);
      let processingStatus = 'ignored';
      let resolvedBusinessId: string | null = null;

      if (business) {
        resolvedBusinessId = business.id;
        const resolvedPlan =
          resolvePlanFromExternalReference(normalizedPayload.externalReference) ||
          business.plan ||
          'basico';

        if (ehReferenciaUpgrade(normalizedPayload.externalReference)) {
          // Diferença de upgrade (2D): só troca o plano, sem reiniciar o período.
          await planChangeService.webhookUpgradePix(
            normalizedPayload.payment as unknown as Record<string, unknown>,
            business.id,
            resolvedPlan as PlanName
          );
        } else if (
          normalizedPayload.formaPagamento === 'card' &&
          (await tratarCobrancaCartao(business, normalizedPayload))
        ) {
          // Cartão cadastrado no teste: a cobrança fica para o fim do teste e o status continua trialing.
        } else {
          await updateBusinessFromAsaasPayment({
            business,
            plan: normalizedPayload.formaPagamento === 'card' ? planoDoCartao(business, normalizedPayload) : resolvedPlan,
            payment: normalizedPayload.payment as unknown as AsaasPayment,
            subscriptionId:
              normalizedPayload.subscriptionId ||
              business.provider_subscription_id ||
              null,
            customerId:
              normalizedPayload.customerId ||
              business.provider_customer_id ||
              null,
            internalStatus: normalizedPayload.internalStatus,
            eventType: normalizedPayload.eventType,
            paymentMethod: normalizedPayload.formaPagamento,
            client: null,
          });

          await saveAsaasPaymentSnapshot({
            businessId: business.id,
            payment: normalizedPayload.payment as unknown as AsaasPayment,
            subscriptionId:
              normalizedPayload.subscriptionId ||
              business.provider_subscription_id ||
              null,
            internalStatus: normalizedPayload.internalStatus,
            pixData: asaasMapper.mapAsaasPaymentToPixData(normalizedPayload.payment),
            plano: resolvedPlan,
            paymentMethod: normalizedPayload.formaPagamento,
            client: null,
          });
        }

        processingStatus = 'processed';
      } else {
        logger.warn(
          {
            eventType: normalizedPayload.eventType,
            paymentId: normalizedPayload.paymentId,
            customerId: normalizedPayload.customerId,
            subscriptionId: normalizedPayload.subscriptionId,
          },
          'Webhook Asaas recebido sem negocio correspondente'
        );
      }

      await subscriptionRepository.storeBillingWebhookEvent(
        {
          provider: 'asaas',
          eventId: normalizedPayload.eventId,
          eventType: normalizedPayload.eventType,
          businessId: resolvedBusinessId,
          payload,
          status: processingStatus,
        },
        null
      );

      return {
        processed: true,
        duplicate: false,
        eventType: normalizedPayload.eventType,
      };
    } catch (error) {
      logger.error(
        {
          err: error,
          provider: 'asaas',
          payloadSummary: {
            event: payload?.event || null,
            paymentId: (payload?.payment as { id?: string } | null)?.id || null,
          },
        },
        'Falha ao processar webhook Asaas'
      );

      throw error;
    }
  },
};
