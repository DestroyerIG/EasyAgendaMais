import type Stripe from 'stripe';
import type { BillingPayment } from '@prisma/client';
import logger from '../../utils/logger.js';
import { NotFoundError } from '../../utils/errors.js';
import { getStripeClient } from '../../config/stripe.js';
import { normalizePlan } from '../../config/planPermissions.js';
import { PLAN_CATALOG } from '../../config/planCatalog.js';
import { subscriptionRepository } from '../../repositories/subscriptionRepository.js';
import { resolveBillingProviderFromContext } from '../../services/billing/statusMapper.js';
import { planChangeRepository } from './planChange.repository.js';

// Leituras da tela Plano e cobrança (2D): faturas, forma de pagamento e o complemento do
// status (mudança agendada, upgrade pendente, profissionais ativas). Nada aqui é exemplo:
// sem dado do provedor ou do banco, a resposta vem vazia.

export type StatusFatura = 'pago' | 'em_aberto' | 'vencido' | 'cancelado' | 'estornado';

export interface FaturaDto {
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

export type FormaPagamentoDto =
  | { tipo: 'card'; bandeira: string; final: string; titular: string | null; validade: string }
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

const BANDEIRAS: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  elo: 'Elo',
  hipercard: 'Hipercard',
  diners: 'Diners',
  discover: 'Discover',
  jcb: 'JCB',
};

const STATUS_ASAAS: Record<string, StatusFatura> = {
  RECEIVED: 'pago',
  CONFIRMED: 'pago',
  RECEIVED_IN_CASH: 'pago',
  PENDING: 'em_aberto',
  AWAITING_RISK_ANALYSIS: 'em_aberto',
  OVERDUE: 'vencido',
  REFUNDED: 'estornado',
  REFUND_REQUESTED: 'estornado',
  REFUND_IN_PROGRESS: 'estornado',
  CHARGEBACK_REQUESTED: 'estornado',
  DELETED: 'cancelado',
};

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
const deUnix = (s: number | null | undefined): Date | null => (s ? new Date(s * 1000) : null);

const nomePlano = (plano: unknown): string => PLAN_CATALOG[normalizePlan(plano)].nome;

const referencia = (tipo: 'mensalidade' | 'upgrade', plano: unknown): string =>
  tipo === 'upgrade'
    ? `Diferença do upgrade para ${nomePlano(plano)}`
    : `Mensalidade EasyAgenda+ ${nomePlano(plano)}`;

const statusPix = (p: BillingPayment): StatusFatura => {
  const externo = String(p.externalStatus ?? '').toUpperCase();
  if (STATUS_ASAAS[externo]) return STATUS_ASAAS[externo]!;
  if (p.internalStatus === 'active') return 'pago';
  if (p.internalStatus === 'canceled') return 'cancelado';
  if (p.internalStatus === 'past_due' || p.internalStatus === 'unpaid') return 'vencido';
  return 'em_aberto';
};

const urlDoPagamento = (p: BillingPayment): string | null => {
  const raw = (p.metadata as { rawPayment?: { invoiceUrl?: string | null } } | null)?.rawPayment;
  return raw?.invoiceUrl ?? null;
};

export const faturaDoPix = (p: BillingPayment, planoNegocio: unknown): FaturaDto => {
  const tipo = p.tipo === 'upgrade' ? 'upgrade' : 'mensalidade';
  const inicio = p.paidAt ?? p.dueDate ?? null;
  const fim = tipo === 'mensalidade' && inicio ? new Date(inicio.getTime()) : null;
  if (fim) {
    fim.setMonth(fim.getMonth() + 1);
    fim.setDate(fim.getDate() - 1);
  }
  return {
    id: `asaas:${p.providerPaymentId}`,
    data: (p.paidAt ?? p.dueDate ?? p.createdAt).toISOString(),
    referencia: referencia(tipo, p.plano ?? planoNegocio),
    periodoInicio: tipo === 'mensalidade' ? iso(inicio) : null,
    periodoFim: iso(fim),
    valor: Number(p.amount ?? 0),
    forma: 'pix',
    formaDetalhe: 'Pix',
    status: statusPix(p),
    tipo,
    url: urlDoPagamento(p),
  };
};

const STATUS_STRIPE: Record<string, StatusFatura> = {
  paid: 'pago',
  open: 'em_aberto',
  uncollectible: 'vencido',
  void: 'cancelado',
};

export const faturaDoStripe = (inv: Stripe.Invoice, planoNegocio: unknown): FaturaDto | null => {
  if (inv.status === 'draft' || !inv.id) return null;
  const linha = inv.lines?.data?.[0];
  const tipo = inv.billing_reason === 'subscription_update' ? 'upgrade' : 'mensalidade';
  const planoLinha = (linha?.metadata?.plan as string | undefined) ?? planoNegocio;
  let status = STATUS_STRIPE[String(inv.status)] ?? 'em_aberto';
  if (status === 'em_aberto' && inv.due_date && inv.due_date * 1000 < Date.now()) status = 'vencido';
  if (status === 'pago' && (inv as unknown as { amount_refunded?: number }).amount_refunded) status = 'estornado';
  return {
    id: `stripe:${inv.id}`,
    data: (deUnix(inv.status_transitions?.paid_at) ?? deUnix(inv.created) ?? new Date()).toISOString(),
    referencia: referencia(tipo, planoLinha),
    periodoInicio: tipo === 'mensalidade' ? iso(deUnix(linha?.period?.start)) : null,
    periodoFim: tipo === 'mensalidade' ? iso(deUnix(linha?.period?.end)) : null,
    valor: (inv.status === 'paid' ? inv.amount_paid : inv.amount_due) / 100,
    forma: 'card',
    formaDetalhe: 'Cartão de crédito',
    status,
    tipo,
    url: inv.hosted_invoice_url ?? null,
  };
};

const carregar = async (businessId: string) => {
  const ctx = (await subscriptionRepository.getBusinessBillingContext(businessId)) as
    | (Record<string, unknown> & { id: string })
    | null;
  if (!ctx) throw new NotFoundError('Negócio');
  return ctx;
};

const faturasStripe = async (customerId: string, plano: unknown): Promise<FaturaDto[]> => {
  try {
    const stripe = getStripeClient();
    const lista = await stripe.invoices.list({ customer: customerId, limit: 100 });
    return lista.data.map((inv) => faturaDoStripe(inv, plano)).filter((f): f is FaturaDto => f !== null);
  } catch (error) {
    logger.warn({ err: error, customerId }, 'Não foi possível listar as faturas do Stripe');
    return [];
  }
};

export const billingInfoService = {
  async faturas(businessId: string, ano: number | null): Promise<{ anos: number[]; itens: FaturaDto[] }> {
    const ctx = await carregar(businessId);
    const pix = (await planChangeRepository.pagamentosPix(businessId))
      // Cobrança da diferença cancelada antes de pagar não é fatura.
      .filter((p) => !(p.tipo === 'upgrade' && statusPix(p) === 'cancelado'))
      .map((p) => faturaDoPix(p, ctx.plan));
    const cartao = ctx.stripe_customer_id ? await faturasStripe(String(ctx.stripe_customer_id), ctx.plan) : [];

    const todas = [...pix, ...cartao].sort((a, b) => b.data.localeCompare(a.data));
    const anos = [...new Set(todas.map((f) => new Date(f.data).getFullYear()))].sort((a, b) => b - a);
    const itens = ano ? todas.filter((f) => new Date(f.data).getFullYear() === ano) : todas;
    return { anos, itens };
  },

  async formaPagamento(businessId: string): Promise<FormaPagamentoDto | null> {
    const ctx = await carregar(businessId);
    const provider = resolveBillingProviderFromContext(ctx);

    if (provider === 'stripe' && ctx.stripe_subscription_id) {
      try {
        const stripe = getStripeClient();
        const sub = await stripe.subscriptions.retrieve(String(ctx.stripe_subscription_id), {
          expand: ['default_payment_method', 'customer.invoice_settings.default_payment_method'],
        });
        const doCliente =
          typeof sub.customer === 'object' && !('deleted' in sub.customer && sub.customer.deleted)
            ? (sub.customer as Stripe.Customer).invoice_settings?.default_payment_method
            : null;
        const pm = (typeof sub.default_payment_method === 'object' && sub.default_payment_method) ||
          (typeof doCliente === 'object' && doCliente) ||
          null;
        const card = (pm as Stripe.PaymentMethod | null)?.card;
        if (!card) return null;
        return {
          tipo: 'card',
          bandeira: BANDEIRAS[card.brand] ?? card.brand,
          final: card.last4,
          titular: (pm as Stripe.PaymentMethod).billing_details?.name ?? null,
          validade: `${String(card.exp_month).padStart(2, '0')}/${String(card.exp_year).slice(-2)}`,
        };
      } catch (error) {
        logger.warn({ err: error, businessId }, 'Não foi possível ler o cartão no Stripe');
        return null;
      }
    }

    if (provider === 'asaas') {
      const aberta = await planChangeRepository.mensalidadePixAberta(businessId);
      return {
        tipo: 'pix',
        cobrancaAberta: aberta
          ? {
              paymentId: aberta.providerPaymentId,
              valor: Number(aberta.amount ?? 0),
              vencimento: iso(aberta.dueDate),
              pixCopyPaste: aberta.pixCopyPaste,
              qrCode: aberta.qrCode,
              url: urlDoPagamento(aberta),
            }
          : null,
      };
    }

    return null;
  },

  async complementoStatus(businessId: string) {
    const ctx = await carregar(businessId);
    const [pendente, nomes] = await Promise.all([
      planChangeRepository.upgradePendente(businessId),
      planChangeRepository.nomesProfissionaisAtivas(businessId),
    ]);
    return {
      planoAgendado: (ctx.plano_agendado as string | null) ?? null,
      planoAgendadoEm: iso(ctx.plano_agendado_em instanceof Date ? ctx.plano_agendado_em : ctx.plano_agendado_em ? new Date(String(ctx.plano_agendado_em)) : null),
      upgradePendente: pendente
        ? {
            plano: pendente.plano,
            valor: Number(pendente.amount ?? 0),
            paymentId: pendente.providerPaymentId,
            pixCopyPaste: pendente.pixCopyPaste,
            qrCode: pendente.qrCode,
          }
        : null,
      profissionaisAtivas: nomes.length,
      nomesProfissionais: nomes,
    };
  },
};
