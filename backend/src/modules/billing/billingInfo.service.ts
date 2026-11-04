import type { BillingPayment } from '@prisma/client';
import { NotFoundError } from '../../utils/errors.js';
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

// Cartão: bandeira e final que o Asaas devolveu na assinatura (metadata.cartao); urlFatura abre a
// fatura em aberto (ou a última) no Asaas, onde ela paga com outro cartão.
export type FormaPagamentoDto =
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

const nomePlano = (plano: unknown): string => PLAN_CATALOG[normalizePlan(plano)].nome;

const referencia = (tipo: 'mensalidade' | 'upgrade', plano: unknown): string =>
  tipo === 'upgrade'
    ? `Diferença do upgrade para ${nomePlano(plano)}`
    : `Mensalidade EasyAgenda+ ${nomePlano(plano)}`;

const statusAsaas = (p: BillingPayment): StatusFatura => {
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

export const faturaDoAsaas = (p: BillingPayment, planoNegocio: unknown): FaturaDto => {
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
    forma: p.paymentMethod === 'card' ? 'card' : 'pix',
    formaDetalhe: p.paymentMethod === 'card' ? 'Cartão de crédito' : 'Pix',
    status: statusAsaas(p),
    tipo,
    url: urlDoPagamento(p),
  };
};

const carregar = async (businessId: string) => {
  const ctx = (await subscriptionRepository.getBusinessBillingContext(businessId)) as
    | (Record<string, unknown> & { id: string })
    | null;
  if (!ctx) throw new NotFoundError('Negócio');
  return ctx;
};

export const billingInfoService = {
  async faturas(businessId: string, ano: number | null): Promise<{ anos: number[]; itens: FaturaDto[] }> {
    const ctx = await carregar(businessId);
    const todas = (await planChangeRepository.pagamentosPix(businessId))
      // Cobrança da diferença cancelada antes de pagar não é fatura.
      .filter((p) => !(p.tipo === 'upgrade' && statusAsaas(p) === 'cancelado'))
      .map((p) => faturaDoAsaas(p, ctx.plan))
      .sort((a, b) => b.data.localeCompare(a.data));
    const anos = [...new Set(todas.map((f) => new Date(f.data).getFullYear()))].sort((a, b) => b - a);
    const itens = ano ? todas.filter((f) => new Date(f.data).getFullYear() === ano) : todas;
    return { anos, itens };
  },

  async formaPagamento(businessId: string): Promise<FormaPagamentoDto | null> {
    const ctx = await carregar(businessId);
    const provider = resolveBillingProviderFromContext(ctx);

    if (provider === 'asaas' && ctx.payment_method === 'card') {
      const cartao = (ctx.metadata as { cartao?: { bandeira?: string | null; final?: string | null } } | null)?.cartao;
      const aberta = await planChangeRepository.mensalidadePixAberta(businessId);
      const ultima = aberta ?? (await planChangeRepository.pagamentosPix(businessId)).find((p) => p.paymentMethod === 'card');
      return {
        tipo: 'card',
        bandeira: cartao?.bandeira ?? null,
        final: cartao?.final ?? null,
        urlFatura: ultima ? urlDoPagamento(ultima) : null,
      };
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
            url: urlDoPagamento(pendente),
          }
        : null,
      profissionaisAtivas: nomes.length,
      nomesProfissionais: nomes,
    };
  },
};
