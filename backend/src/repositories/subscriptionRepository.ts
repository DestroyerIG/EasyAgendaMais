import { prisma } from '../config/prisma.js';
import { Prisma } from '@prisma/client';

const normalizeJsonb = (value: unknown): string | null => {
  if (value === undefined || value === null) {
    return null;
  }

  return JSON.stringify(value);
};

export const subscriptionRepository = {
  async getBusinessBillingContext(businessId: string, _client: unknown = null): Promise<Record<string, unknown> | null> {
    const result = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT id, name, owner_name, email, whatsapp, plan, desired_plan,
             cpf_cnpj,
             asaas_customer_id,
             stripe_customer_id,
             stripe_subscription_id,
             stripe_price_id,
             stripe_payment_mode,
             provider,
             provider_customer_id,
             provider_subscription_id,
             provider_payment_id,
             payment_method,
             subscription_status,
             subscription_current_period_start,
             subscription_current_period_end,
             subscription_cancel_at_period_end,
             current_period_start,
             current_period_end,
             next_due_date,
             last_payment_date,
             canceled_at,
             plano_agendado,
             plano_agendado_em,
             metadata,
             created_at,
             inadimplente_desde,
             (last_payment_date IS NOT NULL
               OR EXISTS (SELECT 1 FROM billing_payments bp WHERE bp.business_id = businesses.id AND bp.paid_at IS NOT NULL)
               OR EXISTS (SELECT 1 FROM subscription_events se WHERE se.business_id = businesses.id
                          AND se.event_type IN ('invoice.paid','invoice.payment_succeeded')
                          AND CASE WHEN se.payload->>'amount_paid' ~ '^[0-9]+([.][0-9]+)?$'
                               THEN (se.payload->>'amount_paid')::numeric ELSE 0 END > 0)) AS ja_pagou
      FROM businesses
      WHERE id = ${businessId}::uuid AND active = true
    `);

    return result?.[0] || null;
  },

  async findByStripeCustomerId(stripeCustomerId: string, _client: unknown = null): Promise<Record<string, unknown> | null> {
    const result = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT id, name, owner_name, email, whatsapp, plan,
             stripe_customer_id,
             stripe_subscription_id,
             stripe_price_id,
             stripe_payment_mode,
             provider,
             provider_customer_id,
             provider_subscription_id,
             provider_payment_id,
             payment_method,
             subscription_status,
             subscription_current_period_start,
             subscription_current_period_end,
             subscription_cancel_at_period_end,
             current_period_start,
             current_period_end,
             next_due_date,
             last_payment_date,
             canceled_at,
             metadata
      FROM businesses
      WHERE stripe_customer_id = ${stripeCustomerId}::text AND active = true
    `);

    return result[0] || null;
  },

  async setStripeCustomerId(businessId: string, stripeCustomerId: string, _client: unknown = null): Promise<Record<string, unknown> | null> {
    const result = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      UPDATE businesses
      SET stripe_customer_id = ${stripeCustomerId}::text,
          provider = COALESCE(provider, 'stripe'),
          provider_customer_id = COALESCE(provider_customer_id, ${stripeCustomerId}::text),
          subscription_updated_at = CURRENT_TIMESTAMP
      WHERE id = ${businessId}::uuid
      RETURNING stripe_customer_id, provider, provider_customer_id
    `);

    return result[0] || null;
  },

  async setAsaasCustomerId(businessId: string, asaasCustomerId: string, _client: unknown = null): Promise<Record<string, unknown> | null> {
    if (!businessId || !asaasCustomerId) {
      return null;
    }

    try {
      const result = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
        UPDATE businesses
        SET asaas_customer_id = ${asaasCustomerId}::text,
            metadata = jsonb_set(
              COALESCE(metadata, '{}'::jsonb),
              '{asaas,customerId}',
              to_jsonb(${asaasCustomerId}::text),
              true
            ),
            subscription_updated_at = CURRENT_TIMESTAMP
        WHERE id = ${businessId}::uuid
        RETURNING id, asaas_customer_id, provider_customer_id, metadata
      `);

      return result[0] || null;
    } catch (error: unknown) {
      if ((error as { code?: string })?.code !== '42703') {
        throw error;
      }

      const fallback = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
        UPDATE businesses
        SET metadata = jsonb_set(
              COALESCE(metadata, '{}'::jsonb),
              '{asaas,customerId}',
              to_jsonb(${asaasCustomerId}::text),
              true
            ),
            provider_customer_id = CASE
              WHEN provider = 'asaas' OR payment_method = 'pix'
                THEN ${asaasCustomerId}::text
              ELSE provider_customer_id
            END,
            subscription_updated_at = CURRENT_TIMESTAMP
        WHERE id = ${businessId}::uuid
        RETURNING id, provider_customer_id, metadata
      `);

      return fallback[0] || null;
    }
  },

  /** Mescla chaves de cobrança no metadata (checkout e cartão do Asaas, desconto da primeira mensalidade). */
  async mesclarMetadataCobranca(businessId: string, parcial: Record<string, unknown>): Promise<void> {
    await prisma.$queryRaw(Prisma.sql`
      UPDATE businesses
      SET metadata = COALESCE(metadata, '{}'::jsonb) || ${normalizeJsonb(parcial)}::jsonb,
          subscription_updated_at = CURRENT_TIMESTAMP
      WHERE id = ${businessId}::uuid
    `);
  },

  async setDesiredPlan(businessId: string, desiredPlan: string, _client: unknown = null): Promise<Record<string, unknown> | null> {
    if (!businessId || !desiredPlan) {
      return null;
    }

    const result = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      UPDATE businesses
         SET desired_plan = ${desiredPlan}::text,
             subscription_updated_at = CURRENT_TIMESTAMP
       WHERE id = ${businessId}::uuid
      RETURNING id, desired_plan
    `);

    return result[0] || null;
  },

  async findByProviderCustomerId(provider: string, providerCustomerId: string, _client: unknown = null): Promise<Record<string, unknown> | null> {
    const result = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT id, name, owner_name, email, whatsapp, plan,
             stripe_customer_id,
             stripe_subscription_id,
             stripe_price_id,
             stripe_payment_mode,
             provider,
             provider_customer_id,
             provider_subscription_id,
             provider_payment_id,
             payment_method,
             subscription_status,
             subscription_current_period_start,
             subscription_current_period_end,
             subscription_cancel_at_period_end,
             current_period_start,
             current_period_end,
             next_due_date,
             last_payment_date,
             canceled_at,
             metadata
      FROM businesses
      WHERE provider = ${provider}::text
        AND provider_customer_id = ${providerCustomerId}::text
        AND active = true
    `);

    return result[0] || null;
  },

  /** Negócio dono de um Checkout Asaas de cartão (o Asaas não repassa o externalReference do checkout). */
  async findByCheckoutCartao(checkoutId: string, client: unknown = null): Promise<Record<string, unknown> | null> {
    const result = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM businesses
      WHERE metadata->'checkoutCartao'->>'id' = ${checkoutId}::text AND active = true
      LIMIT 1
    `);
    return result[0] ? this.getBusinessBillingContext(result[0].id, client) : null;
  },

  /** Cobrança de cartão ainda pendente (a 1ª, no teste com cartão), a mais antiga. */
  async cobrancaPendenteCartao(businessId: string): Promise<string | null> {
    const result = await prisma.$queryRaw<{ provider_payment_id: string }[]>(Prisma.sql`
      SELECT provider_payment_id FROM billing_payments
      WHERE business_id = ${businessId}::uuid AND provider = 'asaas' AND payment_method = 'card'
        AND paid_at IS NULL AND internal_status = 'pending'
      ORDER BY due_date ASC NULLS LAST
      LIMIT 1
    `);
    return result[0]?.provider_payment_id ?? null;
  },

  /** Cartão cadastrado durante o teste: liga a assinatura do Asaas e leva o fim do teste até a 1ª cobrança. */
  async ligarCartaoNoTeste(
    businessId: string,
    { subscriptionId, customerId, fimDoTeste }: { subscriptionId: string; customerId: string | null; fimDoTeste: Date },
  ): Promise<void> {
    await prisma.$queryRaw(Prisma.sql`
      UPDATE businesses
      SET provider = 'asaas',
          payment_method = 'card',
          provider_subscription_id = ${subscriptionId}::text,
          provider_customer_id = COALESCE(${customerId}::text, provider_customer_id),
          subscription_current_period_end = ${fimDoTeste}::timestamp,
          subscription_cancel_at_period_end = false,
          subscription_updated_at = CURRENT_TIMESTAMP
      WHERE id = ${businessId}::uuid
    `);
  },

  async findByProviderSubscriptionId(provider: string, providerSubscriptionId: string, _client: unknown = null): Promise<Record<string, unknown> | null> {
    const result = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT id, name, owner_name, email, whatsapp, plan,
             stripe_customer_id,
             stripe_subscription_id,
             stripe_price_id,
             stripe_payment_mode,
             provider,
             provider_customer_id,
             provider_subscription_id,
             provider_payment_id,
             payment_method,
             subscription_status,
             subscription_current_period_start,
             subscription_current_period_end,
             subscription_cancel_at_period_end,
             current_period_start,
             current_period_end,
             next_due_date,
             last_payment_date,
             canceled_at,
             metadata
      FROM businesses
      WHERE provider = ${provider}::text
        AND provider_subscription_id = ${providerSubscriptionId}::text
        AND active = true
    `);

    return result[0] || null;
  },

  async findByProviderPaymentId(provider: string, providerPaymentId: string, _client: unknown = null): Promise<Record<string, unknown> | null> {
    const result = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT id, name, owner_name, email, whatsapp, plan,
             stripe_customer_id,
             stripe_subscription_id,
             stripe_price_id,
             stripe_payment_mode,
             provider,
             provider_customer_id,
             provider_subscription_id,
             provider_payment_id,
             payment_method,
             subscription_status,
             subscription_current_period_start,
             subscription_current_period_end,
             subscription_cancel_at_period_end,
             current_period_start,
             current_period_end,
             next_due_date,
             last_payment_date,
             canceled_at,
             metadata
      FROM businesses
      WHERE provider = ${provider}::text
        AND provider_payment_id = ${providerPaymentId}::text
        AND active = true
    `);

    return result[0] || null;
  },

  async updateSubscriptionState(
    businessId: string,
    payload: {
      plan?: string | null;
      stripeSubscriptionId?: string | null;
      stripePriceId?: string | null;
      subscriptionStatus?: string | null;
      currentPeriodStart?: string | Date | null;
      currentPeriodEnd?: string | Date | null;
      cancelAtPeriodEnd?: boolean | null;
      stripePaymentMode?: string | null;
      paymentMethod?: string | null;
      clearStripeSubscriptionId?: boolean;
      provider?: string | null;
      providerCustomerId?: string | null;
      providerSubscriptionId?: string | null;
      providerPaymentId?: string | null;
      currentPeriodStartGeneric?: string | Date | null;
      currentPeriodEndGeneric?: string | Date | null;
      nextDueDate?: string | Date | null;
      lastPaymentDate?: string | Date | null;
      canceledAt?: string | Date | null;
      metadata?: unknown;
      stripeCustomerId?: string | null;
    },
    _client: unknown = null
  ): Promise<Record<string, unknown> | null> {
    const p1 = businessId;
    const p2 = payload.plan ?? null;
    const p3 = payload.stripeSubscriptionId ?? null;
    const p4 = payload.stripePriceId ?? null;
    const p5 = payload.subscriptionStatus ?? null;
    const p6 = payload.currentPeriodStart ?? null;
    const p7 = payload.currentPeriodEnd ?? null;
    const p8 = typeof payload.cancelAtPeriodEnd === 'boolean' ? payload.cancelAtPeriodEnd : null;
    const p9 = payload.stripePaymentMode ?? null;
    const p10 = payload.paymentMethod ?? null;
    const p11 = Boolean(payload.clearStripeSubscriptionId);
    const p12 = payload.provider ?? null;
    const p13 = payload.providerCustomerId ?? null;
    const p14 = payload.providerSubscriptionId ?? null;
    const p15 = payload.providerPaymentId ?? null;
    const p16 = payload.currentPeriodStartGeneric ?? payload.currentPeriodStart ?? null;
    const p17 = payload.currentPeriodEndGeneric ?? payload.currentPeriodEnd ?? null;
    const p18 = payload.nextDueDate ?? null;
    const p19 = payload.lastPaymentDate ?? null;
    const p20 = payload.canceledAt ?? null;
    const p21 = normalizeJsonb(payload.metadata);
    const p22 = payload.stripeCustomerId ?? null;

    const result = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      UPDATE businesses
      SET plan = COALESCE(${p2}::text, plan),
          -- Downgrade agendado que acabou de valer (pelo Stripe ou pela rotina) sai da fila.
          plano_agendado = CASE WHEN plano_agendado = COALESCE(${p2}::text, plan) THEN NULL ELSE plano_agendado END,
          plano_agendado_em = CASE WHEN plano_agendado = COALESCE(${p2}::text, plan) THEN NULL ELSE plano_agendado_em END,
          stripe_customer_id = COALESCE(${p22}::text, stripe_customer_id),
          stripe_subscription_id = CASE
            WHEN ${p11}::boolean THEN NULL
            ELSE COALESCE(${p3}::text, stripe_subscription_id)
          END,
          stripe_price_id = COALESCE(${p4}::text, stripe_price_id),
          subscription_status = COALESCE(${p5}::text, subscription_status),
          subscription_current_period_start = COALESCE(${p6}::timestamp, subscription_current_period_start),
          subscription_current_period_end = COALESCE(${p7}::timestamp, subscription_current_period_end),
          subscription_cancel_at_period_end = COALESCE(${p8}::boolean, subscription_cancel_at_period_end),
          stripe_payment_mode = COALESCE(${p9}::text, stripe_payment_mode),
          payment_method = COALESCE(${p10}::text, payment_method),
          provider = COALESCE(
            ${p12}::text,
            provider,
            CASE
              WHEN ${p3}::text IS NOT NULL OR ${p9}::text IS NOT NULL OR ${p13}::text IS NOT NULL OR ${p22}::text IS NOT NULL THEN 'stripe'
              ELSE provider
            END
          ),
          provider_customer_id = COALESCE(${p13}::text, ${p22}::text, provider_customer_id),
          provider_subscription_id = CASE
            WHEN ${p11}::boolean THEN NULL
            ELSE COALESCE(${p14}::text, provider_subscription_id, ${p3}::text)
          END,
          provider_payment_id = COALESCE(${p15}::text, provider_payment_id),
          current_period_start = COALESCE(${p16}::timestamp, current_period_start, ${p6}::timestamp),
          current_period_end = COALESCE(${p17}::timestamp, current_period_end, ${p7}::timestamp),
          next_due_date = COALESCE(${p18}::timestamp, next_due_date, ${p7}::timestamp),
          last_payment_date = COALESCE(${p19}::timestamp, last_payment_date),
          canceled_at = COALESCE(${p20}::timestamp, canceled_at),
          metadata = COALESCE(metadata, '{}'::jsonb) || COALESCE(${p21}::jsonb, '{}'::jsonb),
          subscription_updated_at = CURRENT_TIMESTAMP
      WHERE id = ${p1}::uuid
      RETURNING id, plan, subscription_status,
                subscription_current_period_start,
                subscription_current_period_end,
                subscription_cancel_at_period_end,
                stripe_payment_mode,
                payment_method,
                stripe_subscription_id,
                stripe_price_id,
                provider,
                provider_customer_id,
                provider_subscription_id,
                provider_payment_id,
                current_period_start,
                current_period_end,
                next_due_date,
                last_payment_date,
                canceled_at,
                metadata
    `);

    return result[0] || null;
  },

  async storeSubscriptionEvent(
    event: {
      eventId: string;
      eventType: string;
      businessId?: string | null;
      payload?: unknown;
    },
    _client: unknown = null
  ): Promise<Record<string, unknown> | null> {
    const result = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      INSERT INTO subscription_events (stripe_event_id, event_type, business_id, payload)
      VALUES (${event.eventId}::text, ${event.eventType}::text, ${event.businessId || null}::uuid, ${normalizeJsonb(event.payload)}::jsonb)
      ON CONFLICT (stripe_event_id) DO NOTHING
      RETURNING id
    `);

    return result[0] || null;
  },

  async hasProcessedEvent(eventId: string, _client: unknown = null): Promise<boolean> {
    const result = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT 1 FROM subscription_events WHERE stripe_event_id = ${eventId}::text LIMIT 1
    `);

    return Boolean(result[0]);
  },

  async getSubscriptionStatus(businessId: string, _client: unknown = null): Promise<Record<string, unknown> | null> {
    const result = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT plan,
             desired_plan,
             asaas_customer_id,
             stripe_customer_id,
             stripe_subscription_id,
             stripe_payment_mode,
             provider,
             provider_customer_id,
             provider_subscription_id,
             provider_payment_id,
             payment_method,
             subscription_status,
             subscription_current_period_start,
             subscription_current_period_end,
             subscription_cancel_at_period_end,
             current_period_start,
             current_period_end,
             next_due_date,
             last_payment_date,
             canceled_at,
             metadata
      FROM businesses
      WHERE id = ${businessId}::uuid AND active = true
    `);

    return result[0] || null;
  },

  async expireOneTimeSubscriptions(_client: unknown = null): Promise<{ expiredCount: number; businessIds: string[] }> {
    const result = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      UPDATE businesses
      -- Pix cancelado pela dona termina como 'canceled' no fim do período pago (2D).
      SET subscription_status = CASE WHEN subscription_cancel_at_period_end THEN 'canceled' ELSE 'unpaid' END,
          subscription_updated_at = CURRENT_TIMESTAMP
      WHERE (
        stripe_payment_mode = 'payment'
        OR (provider = 'asaas' AND payment_method = 'pix')
      )
        AND subscription_status IN ('active', 'trialing', 'pending')
        AND COALESCE(current_period_end, subscription_current_period_end) IS NOT NULL
        AND COALESCE(current_period_end, subscription_current_period_end) <= NOW()
      RETURNING id
    `);

    return {
      expiredCount: result.length,
      businessIds: result.map((row) => row.id),
    };
  },

  async storeBillingWebhookEvent(
    event: {
      provider: string;
      eventId: string;
      eventType: string;
      businessId?: string | null;
      payload?: unknown;
      status?: string;
    },
    _client: unknown = null
  ): Promise<Record<string, unknown> | null> {
    const result = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      INSERT INTO billing_webhook_events (
        provider,
        event_id,
        event_type,
        business_id,
        payload,
        processed_at,
        status
      )
      VALUES (
        ${event.provider}::text,
        ${event.eventId}::text,
        ${event.eventType}::text,
        ${event.businessId || null}::uuid,
        ${normalizeJsonb(event.payload)}::jsonb,
        CURRENT_TIMESTAMP,
        ${event.status || 'processed'}::text
      )
      ON CONFLICT (provider, event_id) DO NOTHING
      RETURNING id, provider, event_id, event_type, status, processed_at
    `);

    return result[0] || null;
  },

  async hasProcessedBillingWebhookEvent(provider: string, eventId: string, _client: unknown = null): Promise<boolean> {
    const result = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT 1
      FROM billing_webhook_events
      WHERE provider = ${provider}::text
        AND event_id = ${eventId}::text
      LIMIT 1
    `);

    return Boolean(result[0]);
  },

  async upsertBillingPayment(
    payment: {
      businessId: string;
      provider: string;
      providerPaymentId: string;
      providerSubscriptionId?: string | null;
      paymentMethod?: string | null;
      externalStatus?: string | null;
      internalStatus?: string | null;
      amount?: number | null;
      dueDate?: string | Date | null;
      paidAt?: string | Date | null;
      pixCopyPaste?: string | null;
      qrCode?: string | null;
      tipo?: 'mensalidade' | 'upgrade' | null;
      plano?: string | null;
      metadata?: unknown;
    },
    _client: unknown = null
  ): Promise<Record<string, unknown> | null> {
    const result = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      INSERT INTO billing_payments (
        business_id,
        provider,
        provider_payment_id,
        provider_subscription_id,
        payment_method,
        external_status,
        internal_status,
        amount,
        due_date,
        paid_at,
        pix_copy_paste,
        qr_code,
        tipo,
        plano,
        metadata
      )
      VALUES (
        ${payment.businessId}::uuid,
        ${payment.provider}::text,
        ${payment.providerPaymentId}::text,
        ${payment.providerSubscriptionId ?? null}::text,
        ${payment.paymentMethod ?? null}::text,
        ${payment.externalStatus ?? null}::text,
        ${payment.internalStatus ?? null}::text,
        ${payment.amount ?? null}::numeric,
        ${payment.dueDate ?? null}::timestamp,
        ${payment.paidAt ?? null}::timestamp,
        ${payment.pixCopyPaste ?? null}::text,
        ${payment.qrCode ?? null}::text,
        ${payment.tipo ?? 'mensalidade'}::text,
        ${payment.plano ?? null}::text,
        ${normalizeJsonb(payment.metadata)}::jsonb
      )
      ON CONFLICT (provider, provider_payment_id)
      DO UPDATE SET
        business_id = EXCLUDED.business_id,
        provider_subscription_id = COALESCE(EXCLUDED.provider_subscription_id, billing_payments.provider_subscription_id),
        payment_method = COALESCE(EXCLUDED.payment_method, billing_payments.payment_method),
        external_status = COALESCE(EXCLUDED.external_status, billing_payments.external_status),
        internal_status = COALESCE(EXCLUDED.internal_status, billing_payments.internal_status),
        amount = COALESCE(EXCLUDED.amount, billing_payments.amount),
        due_date = COALESCE(EXCLUDED.due_date, billing_payments.due_date),
        paid_at = COALESCE(EXCLUDED.paid_at, billing_payments.paid_at),
        pix_copy_paste = COALESCE(EXCLUDED.pix_copy_paste, billing_payments.pix_copy_paste),
        qr_code = COALESCE(EXCLUDED.qr_code, billing_payments.qr_code),
        plano = COALESCE(billing_payments.plano, EXCLUDED.plano),
        metadata = COALESCE(EXCLUDED.metadata, billing_payments.metadata),
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `);

    return result[0] || null;
  },

  async findBillingPaymentByProviderPaymentId(provider: string, providerPaymentId: string, _client: unknown = null): Promise<Record<string, unknown> | null> {
    const result = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT *
      FROM billing_payments
      WHERE provider = ${provider}::text
        AND provider_payment_id = ${providerPaymentId}::text
      LIMIT 1
    `);

    return result[0] || null;
  },

  async getClient(): Promise<typeof prisma> {
    return prisma;
  },
};
