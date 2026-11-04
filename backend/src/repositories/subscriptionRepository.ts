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
               OR EXISTS (SELECT 1 FROM billing_payments bp WHERE bp.business_id = businesses.id AND bp.paid_at IS NOT NULL)) AS ja_pagou
      FROM businesses
      WHERE id = ${businessId}::uuid AND active = true
    `);

    return result?.[0] || null;
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
      WHERE (metadata->'checkoutCartao'->>'id' = ${checkoutId}::text
             OR COALESCE(metadata->'checkoutsCartao', '[]'::jsonb) @> jsonb_build_array(${checkoutId}::text))
        AND active = true
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
      subscriptionStatus?: string | null;
      currentPeriodStart?: string | Date | null;
      currentPeriodEnd?: string | Date | null;
      cancelAtPeriodEnd?: boolean | null;
      paymentMethod?: string | null;
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
    },
    _client: unknown = null
  ): Promise<Record<string, unknown> | null> {
    const plano = payload.plan ?? null;
    const status = payload.subscriptionStatus ?? null;
    const inicio = payload.currentPeriodStart ?? null;
    const fim = payload.currentPeriodEnd ?? null;
    const cancelarNoFim = typeof payload.cancelAtPeriodEnd === 'boolean' ? payload.cancelAtPeriodEnd : null;
    const forma = payload.paymentMethod ?? null;
    const provider = payload.provider ?? null;
    const cliente = payload.providerCustomerId ?? null;
    const assinatura = payload.providerSubscriptionId ?? null;
    const cobranca = payload.providerPaymentId ?? null;
    const inicioGenerico = payload.currentPeriodStartGeneric ?? payload.currentPeriodStart ?? null;
    const fimGenerico = payload.currentPeriodEndGeneric ?? payload.currentPeriodEnd ?? null;
    const vencimento = payload.nextDueDate ?? null;
    const pagoEm = payload.lastPaymentDate ?? null;
    const canceladoEm = payload.canceledAt ?? null;
    const metadata = normalizeJsonb(payload.metadata);

    const result = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      UPDATE businesses
      SET plan = COALESCE(${plano}::text, plan),
          -- Downgrade agendado que acabou de valer (pela cobrança ou pela rotina) sai da fila.
          plano_agendado = CASE WHEN plano_agendado = COALESCE(${plano}::text, plan) THEN NULL ELSE plano_agendado END,
          plano_agendado_em = CASE WHEN plano_agendado = COALESCE(${plano}::text, plan) THEN NULL ELSE plano_agendado_em END,
          subscription_status = COALESCE(${status}::text, subscription_status),
          subscription_current_period_start = COALESCE(${inicio}::timestamp, subscription_current_period_start),
          subscription_current_period_end = COALESCE(${fim}::timestamp, subscription_current_period_end),
          subscription_cancel_at_period_end = COALESCE(${cancelarNoFim}::boolean, subscription_cancel_at_period_end),
          payment_method = COALESCE(${forma}::text, payment_method),
          provider = COALESCE(${provider}::text, provider),
          provider_customer_id = COALESCE(${cliente}::text, provider_customer_id),
          provider_subscription_id = COALESCE(${assinatura}::text, provider_subscription_id),
          provider_payment_id = COALESCE(${cobranca}::text, provider_payment_id),
          current_period_start = COALESCE(${inicioGenerico}::timestamp, current_period_start, ${inicio}::timestamp),
          current_period_end = COALESCE(${fimGenerico}::timestamp, current_period_end, ${fim}::timestamp),
          next_due_date = COALESCE(${vencimento}::timestamp, next_due_date, ${fim}::timestamp),
          last_payment_date = COALESCE(${pagoEm}::timestamp, last_payment_date),
          canceled_at = COALESCE(${canceladoEm}::timestamp, canceled_at),
          metadata = COALESCE(metadata, '{}'::jsonb) || COALESCE(${metadata}::jsonb, '{}'::jsonb),
          subscription_updated_at = CURRENT_TIMESTAMP
      WHERE id = ${businessId}::uuid
      RETURNING id, plan, subscription_status,
                subscription_current_period_start,
                subscription_current_period_end,
                subscription_cancel_at_period_end,
                payment_method,
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

  async getSubscriptionStatus(businessId: string, _client: unknown = null): Promise<Record<string, unknown> | null> {
    const result = await prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT plan,
             desired_plan,
             asaas_customer_id,
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
             metadata,
             created_at
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
      -- Pix vence mês a mês; o cartão só expira aqui quando foi cancelado (senão o Asaas cobra de novo).
      WHERE (
        (provider = 'asaas' AND payment_method = 'pix')
        OR (provider = 'asaas' AND payment_method = 'card' AND subscription_cancel_at_period_end
            AND subscription_status <> 'trialing')
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
