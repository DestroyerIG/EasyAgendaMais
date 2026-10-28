import Stripe from 'stripe';
import logger from '../utils/logger.js';
import { AppError, NotFoundError } from '../utils/errors.js';
import { getFrontendBaseUrl, getStripeClient, getStripePriceCatalog } from '../config/stripe.js';
import { subscriptionRepository } from '../repositories/subscriptionRepository.js';
import { stripePricingService } from './stripePricingService.js';
import { stripeCheckoutService } from './stripeCheckoutService.js';
import { estadoContaService } from '../modules/conta/estadoConta.service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StripeSubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'pending'
  | 'past_due'
  | 'unpaid'
  | 'canceled'
  | 'incomplete';

interface StripePriceCatalog {
  recurring: Record<string, string | null>;
  oneTime: Record<string, string | null>;
}

interface BusinessBillingContext {
  id: string;
  name?: string | null;
  email?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_payment_mode?: string | null;
  plan?: string | null;
  subscription_status?: string | null;
  subscription_current_period_start?: unknown;
  subscription_current_period_end?: unknown;
  subscription_cancel_at_period_end?: boolean | null;
  payment_method?: string | null;
  provider_customer_id?: string | null;
  provider_subscription_id?: string | null;
  [key: string]: unknown;
}

interface SubscriptionStatusRow {
  plan?: string | null;
  subscription_status?: string | null;
  subscription_current_period_start?: unknown;
  subscription_current_period_end?: unknown;
  subscription_cancel_at_period_end?: boolean | null;
  stripe_customer_id?: string | null;
  stripe_payment_mode?: string | null;
  payment_method?: string | null;
  [key: string]: unknown;
}

interface UpdatedSubscriptionRow {
  plan?: string | null;
  subscription_status?: string | null;
  subscription_current_period_start?: unknown;
  subscription_current_period_end?: unknown;
  subscription_cancel_at_period_end?: boolean | null;
  [key: string]: unknown;
}

interface StripeErrorShape {
  message?: string;
  type?: string;
  code?: string;
  decline_code?: string;
  requestId?: string;
  raw?: { requestId?: string };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_STATUSES = new Set([
  'active',
  'trialing',
  'pending',
  'past_due',
  'unpaid',
  'canceled',
  'incomplete',
]);

const CHECKOUT_COMPLETION_EVENTS = new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
]);

const SUBSCRIPTION_EVENT_TYPES = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);

const INVOICE_EVENT_TYPES = new Set([
  'invoice.payment_succeeded',
  'invoice.paid',
  'invoice.payment_failed',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const unixToDate = (value: unknown): Date | null => {
  if (!value || Number.isNaN(Number(value))) {
    return null;
  }
  return new Date(Number(value) * 1000);
};

const normalizeStatus = (status: unknown): StripeSubscriptionStatus => {
  const s = String(status || '');

  if (VALID_STATUSES.has(s)) {
    return s as StripeSubscriptionStatus;
  }

  if (s === 'unpaid') {
    return 'unpaid';
  }

  if (s === 'paused') {
    return 'past_due';
  }

  return 'incomplete';
};

const getSubscriptionData = async (
  stripe: Stripe,
  subscriptionRef: string | { id?: string } | null | undefined
): Promise<Stripe.Subscription | null> => {
  const subscriptionId =
    typeof subscriptionRef === 'string' ? subscriptionRef : subscriptionRef?.id;

  if (!subscriptionId) {
    return null;
  }

  return stripe.subscriptions.retrieve(subscriptionId);
};

const getStripeObjectId = (value: unknown): string | null => {
  if (!value) {
    return null;
  }

  return typeof value === 'string'
    ? value
    : (value as { id?: string })?.id || null;
};

const getCheckoutSessionData = async (
  stripe: Stripe,
  session: Stripe.Checkout.Session
): Promise<Stripe.Checkout.Session> => {
  if (!session?.id || (session.customer && session.subscription)) {
    return session;
  }

  return stripe.checkout.sessions.retrieve(session.id);
};

const isActivatingStatus = (status: string): boolean =>
  status === 'active' || status === 'trialing';

const findLatestCustomerSubscription = async (
  stripe: Stripe,
  customerId: string | null | undefined
): Promise<Stripe.Subscription | null> => {
  if (!customerId) {
    return null;
  }

  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 10,
  });

  return (
    subscriptions.data.find((subscription) => isActivatingStatus(subscription.status)) ||
    subscriptions.data[0] ||
    null
  );
};

const ensureCustomer = async (
  stripe: Stripe,
  business: BusinessBillingContext
): Promise<string> => {
  if (business.stripe_customer_id) {
    return business.stripe_customer_id;
  }

  const customer = await stripe.customers.create({
    name: business.name || undefined,
    email: business.email || undefined,
    metadata: {
      businessId: business.id,
    },
  });

  await subscriptionRepository.setStripeCustomerId(business.id, customer.id);
  return customer.id;
};

const hasPriorStripeSubscription = async (
  stripe: Stripe,
  customerId: string,
  business: BusinessBillingContext
): Promise<boolean> => {
  if (business.stripe_subscription_id) {
    return true;
  }

  if (!business.stripe_customer_id) {
    return false;
  }

  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 1,
  });

  return subscriptions.data.length > 0;
};

const getCheckoutSessionPriceId = async (
  stripe: Stripe,
  session: Stripe.Checkout.Session
): Promise<string | null> => {
  const inlinePriceId = session?.line_items?.data?.[0]?.price?.id;
  if (inlinePriceId) {
    return inlinePriceId;
  }

  if (!session?.id) {
    return null;
  }

  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
  return lineItems?.data?.[0]?.price?.id || null;
};

const resolveSessionPaymentMethod = (
  session: Stripe.Checkout.Session,
  explicitPaymentMethod: string | null = null
): string => {
  const normalizedExplicit = stripePricingService.normalizePaymentMethod(explicitPaymentMethod);
  if (normalizedExplicit) {
    return normalizedExplicit;
  }

  const normalizedMetadata = stripePricingService.normalizePaymentMethod(
    session?.metadata?.paymentMethod
  );
  if (normalizedMetadata) {
    return normalizedMetadata;
  }

  const normalizedStripeType = stripePricingService.normalizePaymentMethod(
    session?.payment_method_types?.[0]
  );
  if (normalizedStripeType) {
    return normalizedStripeType;
  }

  return 'card';
};

const getStripeErrorMetadata = (error: unknown): Record<string, unknown> => {
  const err = (error as StripeErrorShape | null) || {};
  return {
    message: err?.message || 'Erro desconhecido no Stripe',
    type: err?.type || null,
    code: err?.code || null,
    declineCode: err?.decline_code || null,
    requestId: err?.requestId || err?.raw?.requestId || null,
  };
};

const updateFromStripeSubscription = async ({
  businessId,
  subscription,
  explicitPlan,
  priceCatalog,
  client,
}: {
  businessId: string;
  subscription: Stripe.Subscription;
  explicitPlan: string | null | undefined;
  priceCatalog: StripePriceCatalog;
  client: unknown;
}): Promise<UpdatedSubscriptionRow> => {
  const stripePriceId = subscription.items?.data?.[0]?.price?.id || null;
  const resolvedByPriceId = stripePricingService.resolvePlanByPriceId(stripePriceId, priceCatalog);
  // O Price da assinatura manda: depois de um upgrade ou da virada de um downgrade agendado
  // (2D), o metadata.plan pode estar atrasado em relação ao item cobrado.
  const resolvedPlan = resolvedByPriceId?.plan || explicitPlan || null;
  const stripeCustomerId = getStripeObjectId(subscription.customer);
  const subscriptionStatus = normalizeStatus(subscription.status);

  const updated = await subscriptionRepository.updateSubscriptionState(
    businessId,
    {
      plan: resolvedPlan,
      stripeCustomerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId,
      stripePaymentMode: 'subscription',
      paymentMethod: 'card',
      subscriptionStatus,
      currentPeriodStart: unixToDate(subscription.current_period_start),
      currentPeriodEnd: unixToDate(subscription.current_period_end),
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      provider: 'stripe',
      providerCustomerId: stripeCustomerId,
      providerSubscriptionId: subscription.id,
      nextDueDate: unixToDate(subscription.current_period_end),
      canceledAt: subscription.canceled_at ? unixToDate(subscription.canceled_at) : null,
      metadata: {
        billingProvider: 'stripe',
        stripeStatus: subscription.status || null,
      },
      clearStripeSubscriptionId: false,
    },
    client
  );

  logger.info(
    {
      event: 'stripe_subscription_synced',
      businessId,
      stripeCustomerId,
      stripeSubscriptionId: subscription.id,
      subscriptionStatus,
      plan: resolvedPlan,
      activated: isActivatingStatus(subscriptionStatus),
    },
    'Assinatura Stripe sincronizada'
  );

  // Vale também para a ressincronização fora do webhook: o estado da conta em cache cai na hora.
  estadoContaService.invalidar(businessId);

  return updated as UpdatedSubscriptionRow;
};

const updatePendingOneTimePayment = async ({
  businessId,
  explicitPlan,
  explicitPaymentMethod,
  client,
}: {
  businessId: string;
  explicitPlan: string | null | undefined;
  explicitPaymentMethod: string | null | undefined;
  client: unknown;
}): Promise<UpdatedSubscriptionRow> => {
  const paymentMethod = stripePricingService.normalizePaymentMethod(explicitPaymentMethod);

  return subscriptionRepository.updateSubscriptionState(
    businessId,
    {
      plan: explicitPlan || null,
      stripePaymentMode: 'payment',
      paymentMethod: paymentMethod || null,
      subscriptionStatus: 'incomplete',
      cancelAtPeriodEnd: false,
      clearStripeSubscriptionId: true,
    },
    client
  ) as Promise<UpdatedSubscriptionRow>;
};

const updatePaidOneTimeCheckout = async ({
  stripe,
  businessId,
  session,
  explicitPlan,
  explicitPaymentMethod,
  priceCatalog,
  client,
}: {
  stripe: Stripe;
  businessId: string;
  session: Stripe.Checkout.Session;
  explicitPlan: string | null | undefined;
  explicitPaymentMethod: string | null | undefined;
  priceCatalog: StripePriceCatalog;
  client: unknown;
}): Promise<UpdatedSubscriptionRow> => {
  const stripePriceId = await getCheckoutSessionPriceId(stripe, session);
  const resolvedByPriceId = stripePricingService.resolvePlanByPriceId(stripePriceId, priceCatalog);
  const resolvedPlan = explicitPlan || resolvedByPriceId?.plan || null;

  if (!resolvedPlan) {
    throw new AppError(
      'Não foi possível identificar o plano do pagamento avulso',
      400,
      'INVALID_PLAN'
    );
  }

  const paymentMethod = resolveSessionPaymentMethod(session, explicitPaymentMethod || null);
  const { periodStart, periodEnd } = stripeCheckoutService.resolveOneTimePeriodDates();

  return subscriptionRepository.updateSubscriptionState(
    businessId,
    {
      plan: resolvedPlan,
      stripeSubscriptionId: null,
      stripePriceId,
      stripePaymentMode: 'payment',
      paymentMethod,
      subscriptionStatus: 'active',
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
      clearStripeSubscriptionId: true,
    },
    client
  ) as Promise<UpdatedSubscriptionRow>;
};

// ---------------------------------------------------------------------------
// Exported service
// ---------------------------------------------------------------------------

export const subscriptionService = {
  async createCheckoutSession(
    businessId: string,
    plan: string,
    paymentMethod: string
  ): Promise<{ sessionId: string; checkoutUrl: string | null }> {
    let pricing: ReturnType<typeof stripePricingService.resolveCheckoutPricing>;

    try {
      pricing = stripePricingService.resolveCheckoutPricing({ plan, paymentMethod });
    } catch (error) {
      logger.error(
        {
          businessId,
          plan,
          paymentMethod,
          stripeSecretConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
          stripeRecurringPrices: {
            basico: process.env.STRIPE_PRICE_ID_BASICO || null,
            profissional: process.env.STRIPE_PRICE_ID_PROFISSIONAL || null,
            premium: process.env.STRIPE_PRICE_ID_PREMIUM || null,
          },
          stripeOneTimePrices: {
            basico: process.env.STRIPE_PRICE_ID_BASICO_ONE_TIME || null,
            profissional: process.env.STRIPE_PRICE_ID_PROFISSIONAL_ONE_TIME || null,
            premium: process.env.STRIPE_PRICE_ID_PREMIUM_ONE_TIME || null,
          },
        },
        'Falha ao resolver pricing do checkout Stripe'
      );

      throw error;
    }

    const stripe = getStripeClient();

    const business = await subscriptionRepository.getBusinessBillingContext(businessId);
    if (!business) {
      throw new NotFoundError('Negócio');
    }

    const customerId = await ensureCustomer(stripe, business as BusinessBillingContext);

    logger.info(
      {
        businessId,
        plan,
        paymentMethod: pricing.paymentMethod,
        mode: pricing.mode,
        flowType: pricing.flowType,
        priceId: pricing.priceId,
      },
      'Criando sessão de checkout Stripe'
    );

    const applyTrial =
      pricing.mode === 'subscription'
        ? !(await hasPriorStripeSubscription(
            stripe,
            customerId,
            business as BusinessBillingContext
          ))
        : false;

    const checkoutPayload = stripeCheckoutService.buildCheckoutSessionPayload({
      customerId,
      businessId,
      plan,
      paymentMethod: pricing.paymentMethod,
      mode: pricing.mode,
      flowType: pricing.flowType,
      priceId: pricing.priceId,
      applyTrial,
    });

    try {
      const session = await stripe.checkout.sessions.create(checkoutPayload as import('stripe').Stripe.Checkout.SessionCreateParams);

      return {
        sessionId: session.id,
        checkoutUrl: session.url,
      };
    } catch (error) {
      const stripeError = getStripeErrorMetadata(error);

      logger.error(
        {
          businessId,
          plan,
          paymentMethod: pricing.paymentMethod,
          mode: pricing.mode,
          flowType: pricing.flowType,
          priceId: pricing.priceId,
          stripeError,
          frontendBaseUrl: getFrontendBaseUrl(),
        },
        'Falha ao criar sessão de checkout Stripe'
      );

      throw new AppError(
        'Não foi possível iniciar o checkout no Stripe no momento. Tente novamente.',
        502,
        'CHECKOUT_SESSION_ERROR'
      );
    }
  },

  async getStatus(businessId: string): Promise<{
    plan: unknown;
    subscriptionStatus: unknown;
    currentPeriodStart: unknown;
    currentPeriodEnd: unknown;
    cancelAtPeriodEnd: unknown;
    hasCustomer: boolean;
    paymentMode: unknown;
    paymentMethod: unknown;
  }> {
    const data = (await subscriptionRepository.getSubscriptionStatus(
      businessId
    )) as SubscriptionStatusRow | null;
    if (!data) {
      throw new NotFoundError('Negócio');
    }

    return {
      plan: data.plan,
      subscriptionStatus: data.subscription_status,
      currentPeriodStart: data.subscription_current_period_start,
      currentPeriodEnd: data.subscription_current_period_end,
      cancelAtPeriodEnd: data.subscription_cancel_at_period_end,
      hasCustomer: Boolean(data.stripe_customer_id),
      paymentMode: data.stripe_payment_mode,
      paymentMethod: data.payment_method,
    };
  },

  async createPortalSession(businessId: string): Promise<{ portalUrl: string }> {
    const stripe = getStripeClient();
    const business = (await subscriptionRepository.getBusinessBillingContext(
      businessId
    )) as BusinessBillingContext | null;

    if (!business) {
      throw new NotFoundError('Negócio');
    }

    if (!business.stripe_customer_id) {
      throw new AppError(
        'Não foi encontrado cliente Stripe para esta conta. Conclua um checkout primeiro.',
        400,
        'CUSTOMER_NOT_FOUND'
      );
    }

    const frontendBaseUrl = getFrontendBaseUrl();

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: business.stripe_customer_id,
      return_url: `${frontendBaseUrl}/dashboard?billing=portal`,
    });

    return {
      portalUrl: portalSession.url,
    };
  },

  async resyncBusinessSubscription(businessId: string): Promise<{
    plan: unknown;
    subscriptionStatus: unknown;
    currentPeriodStart: unknown;
    currentPeriodEnd: unknown;
    cancelAtPeriodEnd: unknown;
  }> {
    const stripe = getStripeClient();
    const priceCatalog = getStripePriceCatalog();

    const business = (await subscriptionRepository.getBusinessBillingContext(
      businessId
    )) as BusinessBillingContext | null;

    if (!business) {
      throw new NotFoundError('Negócio');
    }

    if (business.stripe_payment_mode === 'payment') {
      throw new AppError(
        'Sincronização manual disponível apenas para assinaturas recorrentes por cartão.',
        400,
        'RESYNC_UNAVAILABLE_FOR_ONE_TIME'
      );
    }

    const subscription = business.stripe_subscription_id
      ? await getSubscriptionData(stripe, business.stripe_subscription_id)
      : await findLatestCustomerSubscription(
          stripe,
          business.stripe_customer_id || business.provider_customer_id
        );

    if (!subscription) {
      throw new AppError(
        'Negócio sem assinatura Stripe vinculada para sincronização manual.',
        400,
        'SUBSCRIPTION_NOT_FOUND'
      );
    }

    const updated = await updateFromStripeSubscription({
      businessId,
      subscription,
      explicitPlan: subscription.metadata?.plan || null,
      priceCatalog,
      client: null,
    });

    return {
      plan: updated.plan,
      subscriptionStatus: updated.subscription_status,
      currentPeriodStart: updated.subscription_current_period_start,
      currentPeriodEnd: updated.subscription_current_period_end,
      cancelAtPeriodEnd: updated.subscription_cancel_at_period_end,
    };
  },

  async handleWebhook(
    rawBody: string | Buffer,
    signature: string
  ): Promise<{ processed: boolean; duplicate?: boolean; eventType?: string }> {
    logger.info(
      {
        event: 'stripe_webhook_received',
        hasSignature: Boolean(signature),
      },
      'Webhook Stripe recebido'
    );

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      throw new AppError(
        'Webhook Stripe não configurado no servidor',
        503,
        'BILLING_NOT_CONFIGURED'
      );
    }

    const stripe = getStripeClient();
    const event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    logger.info(
      {
        event: 'stripe_webhook_signature_valid',
        stripeEventId: event.id,
        eventType: event.type,
      },
      'Assinatura do webhook Stripe validada'
    );

    const priceCatalog = getStripePriceCatalog();

    try {
      const alreadyProcessed = await subscriptionRepository.hasProcessedEvent(event.id, null);
      if (alreadyProcessed) {
        return { processed: false, duplicate: true };
      }

      let businessId: string | null = null;

      if (CHECKOUT_COMPLETION_EVENTS.has(event.type)) {
        const session = await getCheckoutSessionData(
          stripe,
          event.data.object as Stripe.Checkout.Session
        );
        const metadataPlan = session.metadata?.plan;
        const metadataBusinessId =
          session.metadata?.businessId || session.metadata?.tenantId;
        const metadataPaymentMethod = session.metadata?.paymentMethod;
        const stripeCustomerId = getStripeObjectId(session.customer);

        if (!metadataBusinessId) {
          throw new AppError(
            'Webhook sem businessId no metadata',
            400,
            'WEBHOOK_METADATA_ERROR'
          );
        }

        logger.info(
          {
            eventType: event.type,
            businessId: metadataBusinessId,
            plan: metadataPlan || null,
            paymentMethod: metadataPaymentMethod || null,
            mode: session.mode,
            paymentStatus: session.payment_status || null,
            stripeCustomerId,
          },
          'Processando webhook de checkout Stripe'
        );

        if (session.mode === 'subscription') {
          const subscription =
            (await getSubscriptionData(stripe, session.subscription as string | null | undefined)) ||
            (await findLatestCustomerSubscription(stripe, stripeCustomerId));

          if (!subscription) {
            throw new AppError(
              'Subscription não encontrada no Stripe',
              400,
              'SUBSCRIPTION_NOT_FOUND'
            );
          }

          await updateFromStripeSubscription({
            businessId: metadataBusinessId,
            subscription,
            explicitPlan: metadataPlan,
            priceCatalog,
            client: null,
          });
        }

        if (session.mode === 'payment') {
          const shouldActivateOneTime =
            event.type === 'checkout.session.async_payment_succeeded' ||
            session.payment_status === 'paid';

          if (shouldActivateOneTime) {
            await updatePaidOneTimeCheckout({
              stripe,
              businessId: metadataBusinessId,
              session,
              explicitPlan: metadataPlan,
              explicitPaymentMethod: metadataPaymentMethod,
              priceCatalog,
              client: null,
            });
          } else {
            await updatePendingOneTimePayment({
              businessId: metadataBusinessId,
              explicitPlan: metadataPlan,
              explicitPaymentMethod: metadataPaymentMethod,
              client: null,
            });

            logger.info(
              {
                eventType: event.type,
                businessId: metadataBusinessId,
                paymentStatus: session.payment_status || null,
              },
              'Pagamento avulso ainda pendente de confirmação no Stripe'
            );
          }
        }

        businessId = metadataBusinessId;
      }

      if (SUBSCRIPTION_EVENT_TYPES.has(event.type)) {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = getStripeObjectId(subscription.customer);

        if (!customerId) {
          throw new AppError('Webhook sem customer id', 400, 'WEBHOOK_METADATA_ERROR');
        }

        const metadataBusinessId =
          subscription.metadata?.businessId || subscription.metadata?.tenantId;
        const business = metadataBusinessId
          ? await subscriptionRepository.getBusinessBillingContext(
              metadataBusinessId,
              null
            )
          : await subscriptionRepository.findByStripeCustomerId(customerId, null);

        if (!business) {
          throw new AppError(
            'Negócio não encontrado para customer Stripe',
            404,
            'BUSINESS_NOT_FOUND'
          );
        }

        const shop = business as BusinessBillingContext;

        const shouldIgnoreEvent =
          shop.stripe_payment_mode === 'payment' &&
          (!shop.stripe_subscription_id ||
            shop.stripe_subscription_id !== subscription.id);

        if (shouldIgnoreEvent) {
          logger.info(
            {
              eventType: event.type,
              businessId: shop.id,
              stripeSubscriptionId: subscription.id,
            },
            'Evento de assinatura ignorado para conta em fluxo one-time'
          );
        } else {
          await updateFromStripeSubscription({
            businessId: shop.id,
            subscription,
            explicitPlan: subscription.metadata?.plan || null,
            priceCatalog,
            client: null,
          });

          businessId = shop.id;
        }
      }

      if (INVOICE_EVENT_TYPES.has(event.type)) {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = getStripeObjectId(invoice.customer);

        if (customerId) {
          let business = (await subscriptionRepository.findByStripeCustomerId(
            customerId,
            null
          )) as BusinessBillingContext | null;

          if (business) {
            businessId = business.id;

            if (business.stripe_payment_mode === 'payment') {
              logger.info(
                {
                  eventType: event.type,
                  businessId: business.id,
                  customerId,
                },
                'Evento de invoice ignorado para conta em fluxo one-time'
              );
            } else {
              const subscription =
                (await getSubscriptionData(
                  stripe,
                  (invoice as { subscription?: string | null }).subscription
                )) || (await findLatestCustomerSubscription(stripe, customerId));

              if (subscription) {
                await updateFromStripeSubscription({
                  businessId: business.id,
                  subscription,
                  explicitPlan: subscription.metadata?.plan || null,
                  priceCatalog,
                  client: null,
                });
              }
            }
          } else {
            const subscription =
              (await getSubscriptionData(
                stripe,
                (invoice as { subscription?: string | null }).subscription
              )) || (await findLatestCustomerSubscription(stripe, customerId));

            const metadataBusinessId =
              subscription?.metadata?.businessId || subscription?.metadata?.tenantId;

            if (metadataBusinessId) {
              business = (await subscriptionRepository.getBusinessBillingContext(
                metadataBusinessId,
                null
              )) as BusinessBillingContext | null;

              if (business && subscription) {
                businessId = business.id;
                await updateFromStripeSubscription({
                  businessId: business.id,
                  subscription,
                  explicitPlan: subscription.metadata?.plan || null,
                  priceCatalog,
                  client: null,
                });
              }
            }
          }
        }
      }

      const insertedEvent = await subscriptionRepository.storeSubscriptionEvent(
        {
          eventId: event.id,
          eventType: event.type,
          businessId,
          payload: event.data?.object || null,
        },
        null
      );

      // O status da assinatura pode ter mudado: o estado da conta em cache cai na hora.
      if (businessId) estadoContaService.invalidar(businessId);

      if (!insertedEvent) {
        return { processed: false, duplicate: true };
      }

      return {
        processed: true,
        eventType: event.type,
      };
    } catch (error) {
      const safeStripeError = getStripeErrorMetadata(error);
      logger.error(
        {
          event: 'stripe_webhook_error',
          err: error,
          eventType: event.type,
          stripeError: safeStripeError,
        },
        'Falha ao processar webhook Stripe'
      );

      throw error;
    }
  },
};
