import logger from '../../utils/logger.js';
import { AppError, NotFoundError } from '../../utils/errors.js';
import { normalizePlan, normalizeSubscriptionStatus } from '../../config/planPermissions.js';
import { PLAN_CATALOG, PLAN_PRICES } from '../../config/planCatalog.js';
import { subscriptionRepository } from '../../repositories/subscriptionRepository.js';
import { asaasService } from '../../integrations/asaas/service.js';
import { asaasClient } from '../../integrations/asaas/client.js';
import { mapAsaasStatusToInternalStatus, resolveBillingProviderFromContext } from '../../services/billing/statusMapper.js';
import type { PlanId } from '../../types/domain.js';
import { planChangeRepository } from './planChange.repository.js';
import { valorMensal, valorMensalOuErro } from '../../config/valorPlano.js';
import {
  bloqueioDowngrade,
  calcularProporcional,
  direcaoTroca,
  referenciaUpgrade,
  type DirecaoTroca,
} from './planChange.rules.js';

// Troca de plano (spec 2D): upgrade vale na hora e cobra a diferença proporcional;
// downgrade vale na renovação. Tudo no Asaas: Pix é cobrança avulsa por mês; cartão é assinatura
// recorrente, e a diferença do upgrade é uma cobrança avulsa paga na página da fatura.

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
      invoiceUrl: string | null;
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
  if (status === 'active' && provider === 'asaas') return ctx.payment_method === 'card' ? 'card' : 'pix';
  throw new AppError(
    'Sua conta ainda não tem uma assinatura paga ativa. Escolha o plano pelo checkout.',
    409,
    'SEM_ASSINATURA_ATIVA'
  );
};

// Valores mensais do negócio para o proporcional; o Salão sem valor combinado recusa (sob consulta).
const valoresDaTroca = (ctx: Contexto, atual: PlanId, novo: PlanId) => ({
  valorAtual: valorMensal(ctx, atual) ?? PLAN_PRICES[atual],
  valorNovo: valorMensalOuErro(ctx, novo),
});

const validarPlano = (ctx: Contexto, plano: PlanId) => {
  const atual = normalizePlan(ctx.plan);
  const direcao = direcaoTroca(atual, plano);
  if (direcao === 'igual') {
    throw new AppError(`Você já está no plano ${PLAN_CATALOG[plano].nome}.`, 400, 'MESMO_PLANO');
  }
  return { atual, direcao };
};

const pixDoPagamento = async (paymentId: string) => {
  const { pixData } = await asaasService.getPaymentWithPixData(paymentId);
  return { pixCopyPaste: pixData?.pixCopyPaste ?? null, qrCode: pixData?.qrCode ?? null };
};

const urlDaFatura = (pagamento: { metadata?: unknown } | null | undefined): string | null => {
  const raw = (pagamento?.metadata as { rawPayment?: { invoiceUrl?: string | null } } | null)?.rawPayment;
  return raw?.invoiceUrl ?? null;
};

/** Valor da assinatura de cartão no Asaas; muda também a cobrança já gerada do próximo ciclo. */
const valorDaAssinaturaCartao = async (ctx: Contexto, plano: PlanId): Promise<void> => {
  if (ctx.payment_method !== 'card' || !ctx.provider_subscription_id) return;
  await asaasService.atualizarAssinatura(String(ctx.provider_subscription_id), {
    value: valorMensal(ctx, plano) ?? PLAN_PRICES[plano],
    updatePendingPayments: true,
  });
};

const cancelarCobrancaAsaas = async (paymentId: string) => {
  try {
    await asaasClient.delete(`/payments/${paymentId}`);
  } catch (error) {
    logger.warn({ err: error, paymentId }, 'Não foi possível cancelar a cobrança de upgrade no Asaas');
  }
};

const upgradeAvulso = async (ctx: Contexto, atual: PlanId, novo: PlanId, forma: 'card' | 'pix'): Promise<ResultadoTroca> => {
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
      invoiceUrl: urlDaFatura(pendente),
    };
  }
  if (pendente) {
    await cancelarCobrancaAsaas(pendente.providerPaymentId);
    await planChangeRepository.marcarPagamento(pendente.id, 'canceled', 'DELETED');
  }

  const { inicio, fim } = periodo(ctx);
  const { valor } = calcularProporcional({ atual, novo, inicio, fim, agora: new Date(), ...valoresDaTroca(ctx, atual, novo) });
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

  const pagamento =
    forma === 'card'
      ? await asaasService.criarCobrancaCartao({
          customerId: customer,
          valor,
          externalReference: referenciaUpgrade(ctx.id, novo),
          descricao: `EasyAgenda+ - diferença do plano ${PLAN_CATALOG[novo].nome}`,
        })
      : await asaasService.createPixCharge({
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
  const pix = forma === 'pix' ? await pixDoPagamento(paymentId) : { pixCopyPaste: null, qrCode: null };

  await subscriptionRepository.upsertBillingPayment({
    businessId: ctx.id,
    provider: 'asaas',
    providerPaymentId: paymentId,
    paymentMethod: forma,
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

  logger.info({ event: 'billing_upgrade_created', businessId: ctx.id, plan: novo, valor, forma }, 'Cobrança da diferença do upgrade criada');
  return {
    tipo: 'upgrade',
    status: 'aguardando',
    plano: novo,
    valor,
    paymentId,
    ...pix,
    invoiceUrl: (pagamento as { invoiceUrl?: string | null }).invoiceUrl ?? null,
  };
};

export const planChangeService = {
  async previa(businessId: string, plano: PlanId): Promise<PreviaTroca> {
    const ctx = await carregar(businessId);
    const forma = formaDaAssinatura(ctx);
    const { atual, direcao } = validarPlano(ctx, plano);
    const { inicio, fim } = periodo(ctx);
    valorMensalOuErro(ctx, plano);

    if (direcao === 'upgrade') {
      const { valor, dias } = calcularProporcional({ atual, novo: plano, inicio, fim, agora: new Date(), ...valoresDaTroca(ctx, atual, plano) });
      return {
        tipo: 'upgrade',
        planoAtual: atual,
        planoNovo: plano,
        valorHoje: valor,
        dias,
        valorMensalNovo: valorMensalOuErro(ctx, plano),
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
      valorMensalNovo: valorMensalOuErro(ctx, plano),
      aPartirDe: fim?.toISOString() ?? null,
      formaPagamento: forma,
      bloqueio: motivo ? { motivo } : null,
    };
  },

  async trocar(businessId: string, plano: PlanId): Promise<ResultadoTroca> {
    const ctx = await carregar(businessId);
    const forma = formaDaAssinatura(ctx);
    const { atual, direcao } = validarPlano(ctx, plano);
    valorMensalOuErro(ctx, plano);

    if (direcao === 'upgrade') {
      return upgradeAvulso(ctx, atual, plano, forma);
    }

    const ativas = await planChangeRepository.contarProfissionaisAtivas(businessId);
    const motivo = bloqueioDowngrade(plano, ativas);
    if (motivo) throw new AppError(motivo, 409, 'DOWNGRADE_BLOQUEADO');

    const { fim } = periodo(ctx);
    await valorDaAssinaturaCartao(ctx, plano);
    await planChangeRepository.agendarPlano(businessId, plano, fim ?? new Date());
    logger.info({ event: 'billing_downgrade_scheduled', businessId, plan: plano, at: fim }, 'Downgrade agendado');
    return { tipo: 'downgrade', agendadoPara: fim?.toISOString() ?? null, plano };
  },

  async cancelar(businessId: string): Promise<{ cancelado: 'downgrade' | 'upgrade' }> {
    const ctx = await carregar(businessId);

    if (ctx.plano_agendado) {
      await valorDaAssinaturaCartao(ctx, normalizePlan(ctx.plan));
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
      paymentMethod: payment.billingType === 'CREDIT_CARD' ? 'card' : 'pix',
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
    await valorDaAssinaturaCartao(ctx, plano);
    logger.info({ event: 'billing_upgrade_paid', businessId, plan: plano, paymentId }, 'Upgrade aplicado');
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
