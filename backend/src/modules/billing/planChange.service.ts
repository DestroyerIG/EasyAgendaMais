import type Stripe from 'stripe';
import logger from '../../utils/logger.js';
import { AppError, NotFoundError } from '../../utils/errors.js';
import { getStripeClient } from '../../config/stripe.js';
import { normalizePlan, normalizeSubscriptionStatus } from '../../config/planPermissions.js';
import { PLAN_CATALOG, PLAN_PRICES } from '../../config/planCatalog.js';
import { subscriptionRepository } from '../../repositories/subscriptionRepository.js';
import { stripePricingService } from '../../services/stripePricingService.js';
import { asaasService } from '../../integrations/asaas/service.js';
import { asaasClient } from '../../integrations/asaas/client.js';
import { mapAsaasStatusToInternalStatus, resolveBillingProviderFromContext } from '../../services/billing/statusMapper.js';
import type { PlanId } from '../../types/domain.js';
import { planChangeRepository } from './planChange.repository.js';
import {
  bloqueioDowngrade,
  calcularProporcional,
  direcaoTroca,
  referenciaUpgrade,
  type DirecaoTroca,
} from './planChange.rules.js';

// Troca de plano (spec 2D): upgrade vale na hora e cobra a diferença proporcional;
// downgrade vale na renovação. Cartão = Stripe, Pix = Asaas (cobrança avulsa por mês).

type Contexto = Record<string, unknown> & { id: string };

export interface PreviaTroca {
  tipo: Exclude<DirecaoTroca, 'igual'>;
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
    }
  | { tipo: 'downgrade'; agendadoPara: string | null; plano: PlanId };

const dataOuNull = (valor: unknown): Date | null => {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(String(valor));
  return Number.isNaN(d.getTime()) ? null : d;
};

const periodo = (ctx: Contexto) => ({
  inicio: dataOuNull(ctx.current_period_start ?? ctx.subscription_current_period_start),
  fim: dataOuNull(ctx.current_period_end ?? ctx.subscription_current_period_end ?? ctx.next_due_date),
});

const carregar = async (businessId: string): Promise<Contexto> => {
  const ctx = (await subscriptionRepository.getBusinessBillingContext(businessId)) as Contexto | null;
  if (!ctx) throw new NotFoundError('Negócio');
  return ctx;
};

// Só assinatura paga e ativa troca de plano por aqui. Em teste, cancelada ou com cupom,
// a escolha passa pelo checkout que já existe.
const formaDaAssinatura = (ctx: Contexto): 'card' | 'pix' => {
  const status = normalizeSubscriptionStatus(ctx.subscription_status);
  const provider = resolveBillingProviderFromContext(ctx);
  if (status === 'active' && provider === 'stripe' && ctx.stripe_subscription_id) return 'card';
  if (status === 'active' && provider === 'asaas') return 'pix';
  throw new AppError(
    'Sua conta ainda não tem uma assinatura paga ativa. Escolha o plano pelo checkout.',
    409,
    'SEM_ASSINATURA_ATIVA'
  );
};

const validarPlano = (ctx: Contexto, plano: PlanId) => {
  const atual = normalizePlan(ctx.plan);
  const direcao = direcaoTroca(atual, plano);
  if (direcao === 'igual') {
    throw new AppError(`Você já está no plano ${PLAN_CATALOG[plano].nome}.`, 400, 'MESMO_PLANO');
  }
  return { atual, direcao };
};

const precoStripe = (plano: PlanId): string =>
  stripePricingService.resolveCheckoutPricing({ plan: plano, paymentMethod: 'card' }).priceId;

const idDoSchedule = (sub: Stripe.Subscription): string | null =>
  typeof sub.schedule === 'string' ? sub.schedule : sub.schedule?.id ?? null;

const pixDoPagamento = async (paymentId: string) => {
  const { pixData } = await asaasService.getPaymentWithPixData(paymentId);
  return { pixCopyPaste: pixData?.pixCopyPaste ?? null, qrCode: pixData?.qrCode ?? null };
};

const upgradeNoCartao = async (ctx: Contexto, novo: PlanId): Promise<ResultadoTroca> => {
  const stripe = getStripeClient();
  const subId = String(ctx.stripe_subscription_id);
  let sub = await stripe.subscriptions.retrieve(subId);

  // Um downgrade agendado (schedule) impede mexer nos itens: solta antes.
  const scheduleId = idDoSchedule(sub);
  if (scheduleId) {
    await stripe.subscriptionSchedules.release(scheduleId);
    sub = await stripe.subscriptions.retrieve(subId);
  }

  const item = sub.items.data[0];
  if (!item) throw new AppError('Assinatura do cartão sem item de plano.', 409, 'ASSINATURA_INVALIDA');

  // pending_if_incomplete: a troca só vale se a diferença for paga. Se o cartão recusar,
  // o Stripe guarda a mudança em `pending_update` e descarta sozinho depois.
  const atualizado = await stripe.subscriptions.update(subId, {
    items: [{ id: item.id, price: precoStripe(novo) }],
    proration_behavior: 'always_invoice',
    payment_behavior: 'pending_if_incomplete',
  });

  if (atualizado.pending_update) {
    return { tipo: 'upgrade', status: 'falhou', motivo: 'Não conseguimos cobrar a diferença no cartão.' };
  }

  await stripe.subscriptions.update(subId, { metadata: { ...(atualizado.metadata ?? {}), plan: novo } });
  await planChangeRepository.aplicarPlano(ctx.id, novo);
  logger.info({ event: 'billing_upgrade_card', businessId: ctx.id, plan: novo }, 'Upgrade no cartão aplicado');
  return { tipo: 'upgrade', status: 'pago', plano: novo };
};

const cancelarCobrancaAsaas = async (paymentId: string) => {
  try {
    await asaasClient.delete(`/payments/${paymentId}`);
  } catch (error) {
    logger.warn({ err: error, paymentId }, 'Não foi possível cancelar a cobrança de upgrade no Asaas');
  }
};

const upgradeNoPix = async (ctx: Contexto, atual: PlanId, novo: PlanId): Promise<ResultadoTroca> => {
  const pendente = await planChangeRepository.upgradePendente(ctx.id);
  if (pendente && pendente.plano === novo) {
    // Pedir de novo devolve a mesma cobrança (dois cliques não cobram duas vezes).
    return {
      tipo: 'upgrade',
      status: 'aguardando',
      plano: novo,
      valor: Number(pendente.amount ?? 0),
      paymentId: pendente.providerPaymentId,
      pixCopyPaste: pendente.pixCopyPaste,
      qrCode: pendente.qrCode,
    };
  }
  if (pendente) {
    await cancelarCobrancaAsaas(pendente.providerPaymentId);
    await planChangeRepository.marcarPagamento(pendente.id, 'canceled', 'DELETED');
  }

  const { inicio, fim } = periodo(ctx);
  const { valor } = calcularProporcional({ atual, novo, inicio, fim, agora: new Date() });
  if (valor === 0) {
    await planChangeRepository.aplicarPlano(ctx.id, novo);
    return { tipo: 'upgrade', status: 'pago', plano: novo };
  }

  const customer =
    (ctx.provider_customer_id as string | null) ||
    (ctx.asaas_customer_id as string | null) ||
    (
      await asaasService.getOrCreateAsaasCustomer({
        business: ctx,
        onCustomerResolved: (id: string) => subscriptionRepository.setAsaasCustomerId(ctx.id, id).then(() => undefined),
      })
    ).id;

  const pagamento = await asaasService.createPixCharge({
    customerId: customer,
    businessId: ctx.id,
    plan: novo,
    amount: valor,
    externalReference: referenciaUpgrade(ctx.id, novo),
  });
  if (!pagamento.id) {
    throw new AppError('O Asaas não devolveu a cobrança da diferença.', 502, 'ASAAS_SEM_PAGAMENTO');
  }
  const paymentId = pagamento.id;
  const pix = await pixDoPagamento(paymentId);

  await subscriptionRepository.upsertBillingPayment({
    businessId: ctx.id,
    provider: 'asaas',
    providerPaymentId: paymentId,
    paymentMethod: 'pix',
    externalStatus: pagamento.status ?? null,
    internalStatus: 'pending',
    amount: valor,
    dueDate: pagamento.dueDate ?? null,
    pixCopyPaste: pix.pixCopyPaste,
    qrCode: pix.qrCode,
    tipo: 'upgrade',
    plano: novo,
    metadata: { rawPayment: pagamento },
  });

  logger.info({ event: 'billing_upgrade_pix_created', businessId: ctx.id, plan: novo, valor }, 'Cobrança da diferença do upgrade criada');
  return { tipo: 'upgrade', status: 'aguardando', plano: novo, valor, paymentId, ...pix };
};

const downgradeNoCartao = async (ctx: Contexto, atual: PlanId, novo: PlanId): Promise<void> => {
  const stripe = getStripeClient();
  const subId = String(ctx.stripe_subscription_id);
  const sub = await stripe.subscriptions.retrieve(subId);
  const scheduleId =
    idDoSchedule(sub) ?? (await stripe.subscriptionSchedules.create({ from_subscription: subId })).id;
  const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
  const faseAtual = schedule.phases[0];
  const fim = (sub as unknown as { current_period_end: number }).current_period_end;

  await stripe.subscriptionSchedules.update(scheduleId, {
    end_behavior: 'release',
    phases: [
      {
        items: [{ price: precoStripe(atual), quantity: 1 }],
        start_date: faseAtual?.start_date ?? 'now',
        end_date: fim,
      },
      {
        items: [{ price: precoStripe(novo), quantity: 1 }],
        iterations: 1,
        proration_behavior: 'none',
        metadata: { plan: novo },
      },
    ],
  });
};

export const planChangeService = {
  async previa(businessId: string, plano: PlanId): Promise<PreviaTroca> {
    const ctx = await carregar(businessId);
    const forma = formaDaAssinatura(ctx);
    const { atual, direcao } = validarPlano(ctx, plano);
    const { inicio, fim } = periodo(ctx);

    if (direcao === 'upgrade') {
      const { valor, dias } = calcularProporcional({ atual, novo: plano, inicio, fim, agora: new Date() });
      return {
        tipo: 'upgrade',
        planoAtual: atual,
        planoNovo: plano,
        valorHoje: valor,
        dias,
        valorMensalNovo: PLAN_PRICES[plano],
        aPartirDe: fim?.toISOString() ?? null,
        formaPagamento: forma,
        bloqueio: null,
      };
    }

    const ativas = await planChangeRepository.contarProfissionaisAtivas(businessId);
    const motivo = bloqueioDowngrade(plano, ativas);
    return {
      tipo: 'downgrade',
      planoAtual: atual,
      planoNovo: plano,
      valorHoje: 0,
      dias: 0,
      valorMensalNovo: PLAN_PRICES[plano],
      aPartirDe: fim?.toISOString() ?? null,
      formaPagamento: forma,
      bloqueio: motivo ? { motivo } : null,
    };
  },

  async trocar(businessId: string, plano: PlanId): Promise<ResultadoTroca> {
    const ctx = await carregar(businessId);
    const forma = formaDaAssinatura(ctx);
    const { atual, direcao } = validarPlano(ctx, plano);

    if (direcao === 'upgrade') {
      return forma === 'card' ? upgradeNoCartao(ctx, plano) : upgradeNoPix(ctx, atual, plano);
    }

    const ativas = await planChangeRepository.contarProfissionaisAtivas(businessId);
    const motivo = bloqueioDowngrade(plano, ativas);
    if (motivo) throw new AppError(motivo, 409, 'DOWNGRADE_BLOQUEADO');

    const { fim } = periodo(ctx);
    if (forma === 'card') await downgradeNoCartao(ctx, atual, plano);
    await planChangeRepository.agendarPlano(businessId, plano, fim ?? new Date());
    logger.info({ event: 'billing_downgrade_scheduled', businessId, plan: plano, at: fim }, 'Downgrade agendado');
    return { tipo: 'downgrade', agendadoPara: fim?.toISOString() ?? null, plano };
  },

  async cancelar(businessId: string): Promise<{ cancelado: 'downgrade' | 'upgrade' }> {
    const ctx = await carregar(businessId);

    if (ctx.plano_agendado) {
      if (resolveBillingProviderFromContext(ctx) === 'stripe' && ctx.stripe_subscription_id) {
        const stripe = getStripeClient();
        const sub = await stripe.subscriptions.retrieve(String(ctx.stripe_subscription_id));
        const scheduleId = idDoSchedule(sub);
        if (scheduleId) await stripe.subscriptionSchedules.release(scheduleId);
      }
      await planChangeRepository.limparPlanoAgendado(businessId, normalizePlan(ctx.plan));
      return { cancelado: 'downgrade' };
    }

    const pendente = await planChangeRepository.upgradePendente(businessId);
    if (pendente) {
      await cancelarCobrancaAsaas(pendente.providerPaymentId);
      await planChangeRepository.marcarPagamento(pendente.id, 'canceled', 'DELETED');
      return { cancelado: 'upgrade' };
    }

    throw new AppError('Nenhuma mudança de plano pendente.', 404, 'SEM_MUDANCA_PENDENTE');
  },

  // Webhook do Asaas para a cobrança da diferença (externalReference termina em ":upgrade").
  // Só troca o plano; o período da mensalidade continua o mesmo.
  async webhookUpgradePix(payment: Record<string, unknown>, businessId: string, plano: PlanId): Promise<void> {
    const internalStatus = mapAsaasStatusToInternalStatus(payment.status);
    const paymentId = String(payment.id ?? '');
    await subscriptionRepository.upsertBillingPayment({
      businessId,
      provider: 'asaas',
      providerPaymentId: paymentId,
      paymentMethod: 'pix',
      externalStatus: (payment.status as string | undefined) ?? null,
      internalStatus,
      amount: typeof payment.value === 'number' ? payment.value : null,
      dueDate: (payment.dueDate as string | undefined) ?? null,
      paidAt: (payment.confirmedDate as string | undefined) ?? (payment.paymentDate as string | undefined) ?? null,
      tipo: 'upgrade',
      plano,
      metadata: { rawPayment: payment },
    });

    if (internalStatus !== 'active') return;

    const ctx = await carregar(businessId);
    if (direcaoTroca(normalizePlan(ctx.plan), plano) !== 'upgrade') return;
    await planChangeRepository.aplicarPlano(businessId, plano);
    logger.info({ event: 'billing_upgrade_pix_paid', businessId, plan: plano, paymentId }, 'Upgrade no Pix aplicado');
  },

  // Rotina diária: downgrades Pix cujo período acabou.
  async aplicarDowngradesVencidos(agora: Date = new Date()): Promise<number> {
    const vencidos = await planChangeRepository.downgradesVencidos(agora);
    for (const negocio of vencidos) {
      if (!negocio.planoAgendado) continue;
      await planChangeRepository.aplicarPlano(negocio.id, normalizePlan(negocio.planoAgendado));
      logger.info(
        { event: 'billing_downgrade_applied', businessId: negocio.id, from: negocio.plan, to: negocio.planoAgendado },
        'Downgrade agendado aplicado'
      );
    }
    return vencidos.length;
  },
};
