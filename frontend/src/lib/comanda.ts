import { AxiosError } from 'axios';
import api from '@/lib/api';
import type { Appointment } from '@/types';

// ─── Cálculo: cópia exata de backend/src/modules/comandas/comandaMath.ts ─────────
// Os dois arquivos têm os mesmos testes; mudou um, mude o outro.
// coveredValue: sessão coberta por clube/pacote — sai a R$ 0, mas o valor por sessão entra na base de comissão.
export interface ComandaItemInput { kind: 'servico' | 'produto'; unitPrice: number; quantity: number; coveredValue?: number | null }
export interface ComandaCalcInput {
  items: ComandaItemInput[]; depositAvailable: number; discount: number; tip: number;
  serviceCommissionPct: number; productCommissionPct: number;
  memberDiscountPct?: number;
}
export interface ComandaCalc {
  servicesTotal: number; productsTotal: number; subtotal: number;
  depositApplied: number; discount: number; tip: number; totalCharged: number;
  revenue: number;
  commissionService: number; commissionProduct: number; commissionTotal: number;
  houseRetention: number;
  serviceBase: number; productBase: number;
  coveredTotal: number; memberDiscount: number;
}
const toCents = (v: number): number => Math.round((Number(v) || 0) * 100);
const fromCents = (c: number): number => c / 100;
const pos = (c: number) => Math.max(0, c);
const pctOf = (cents: number, pct: number) => Math.floor((cents * Math.round(pct * 100)) / 10000 + 0.5);

export function calcularComanda(input: ComandaCalcInput): ComandaCalc {
  let services = 0;
  let products = 0;
  let covered = 0;
  for (const item of input.items) {
    if (item.coveredValue != null) { covered += toCents(item.coveredValue); continue; }
    const linha = toCents(item.unitPrice) * Math.max(1, Math.floor(item.quantity));
    if (item.kind === 'servico') services += linha; else products += linha;
  }
  const subtotal = services + products;
  const depositApplied = Math.min(pos(toCents(input.depositAvailable)), subtotal);
  const member = pctOf(subtotal, Math.min(100, Math.max(0, input.memberDiscountPct ?? 0)));
  const discount = Math.min(pos(toCents(input.discount)) + member, subtotal - depositApplied);
  const tip = pos(toCents(input.tip));
  const totalCharged = subtotal - depositApplied - discount + tip;
  const revenue = subtotal - discount;
  const descontoServico = subtotal > 0 ? Math.round((discount * services) / subtotal) : 0;
  const serviceBase = services - descontoServico + covered;
  const productBase = products - (discount - descontoServico);
  const commissionService = pctOf(serviceBase, input.serviceCommissionPct);
  const commissionProduct = pctOf(productBase, input.productCommissionPct);
  return {
    servicesTotal: fromCents(services), productsTotal: fromCents(products), subtotal: fromCents(subtotal),
    depositApplied: fromCents(depositApplied), discount: fromCents(discount), tip: fromCents(tip),
    totalCharged: fromCents(totalCharged), revenue: fromCents(revenue),
    commissionService: fromCents(commissionService), commissionProduct: fromCents(commissionProduct),
    commissionTotal: fromCents(commissionService + commissionProduct + tip),
    houseRetention: fromCents(revenue - commissionService - commissionProduct),
    serviceBase: fromCents(serviceBase), productBase: fromCents(productBase),
    coveredTotal: fromCents(covered), memberDiscount: fromCents(Math.min(member, discount)),
  };
}

// ─── Tipos espelhando o backend (comandas.types.ts / appointments) ─────────────
export type PaymentMethod = 'pix' | 'debito' | 'credito' | 'dinheiro';
export const ROTULO_PAGAMENTO: Record<PaymentMethod, string> = {
  pix: 'Pix', debito: 'Cartão débito', credito: 'Cartão crédito', dinheiro: 'Dinheiro',
};

export interface ComandaItem {
  id: string | null; kind: 'servico' | 'produto'; refId: string | null; name: string;
  unitPrice: number; quantity: number; durationMinutes: number | null; isMain: boolean;
  coveredValue: number | null;
}

// Clube/pacote que cobre o serviço principal (sub-projeto 4).
export interface CoberturaComanda {
  disponivel: { contratoId: string; nome: string; tipo: 'clube' | 'pacote'; sessao: number | null; de: number | null; valorSessao: number } | null;
  bloqueio: { nome: string; motivo: string } | null;
  usando: boolean;
  descontoSociaPct: number;
}
export interface ComandaDetail {
  id: string; number: number; status: 'rascunho' | 'fechada';
  appointment: { id: string; date: string; time: string; status: string; source: string };
  client: { id: string; name: string; phone: string };
  professional: { id: string; name: string };
  items: ComandaItem[];
  depositAvailable: number;
  discount: number; tip: number; paymentMethod: PaymentMethod | null;
  commission: { servicePct: number; productPct: number; origem: 'profissional' | 'negocio' };
  cobertura: CoberturaComanda;
  calc: ComandaCalc;
  whatsappConnected: boolean;
  closedAt: string | null; receiptSentAt: string | null;
}
export interface ComandaExtraInput { kind: 'servico' | 'produto'; id: string; quantity: number }
export interface SalvarComandaInput {
  extras: ComandaExtraInput[]; discount: number; tip: number; paymentMethod: PaymentMethod | null;
  usarCobertura?: boolean;
}
export interface ComandaShortcut { kind: 'servico' | 'produto'; id: string; name: string; price: number }
export interface AppointmentDetails {
  appointment: Appointment;
  client_stats: {
    visits_this_year: number; average_cycle_days: number | null; last_visit_days_ago: number | null;
    last_visit_professional: string | null; is_recurring: boolean;
  };
  client_notes: string | null;
}
export interface CommissionSettings { serviceCommissionPct: number; productCommissionPct: number }

// ─── API ───────────────────────────────────────────────────────────────────────
export const abrirComanda = async (appointmentId: string) =>
  (await api.post<ComandaDetail>(`/appointments/${appointmentId}/comanda`)).data;
export const salvarComanda = async (id: string, input: SalvarComandaInput) =>
  (await api.put<ComandaDetail>(`/comandas/${id}`, input)).data;
export const fecharComanda = async (id: string, input: SalvarComandaInput) =>
  (await api.post<ComandaDetail>(`/comandas/${id}/close`, input)).data;
export const reenviarComprovante = async (id: string) =>
  (await api.post<{ sent: boolean }>(`/comandas/${id}/receipt`)).data;
export const buscarAtalhos = async () => (await api.get<ComandaShortcut[]>('/comandas/shortcuts')).data;
export const buscarDetalhesAgendamento = async (id: string) =>
  (await api.get<AppointmentDetails>(`/appointments/${id}/details`)).data;
export const buscarRegraComissao = async () => (await api.get<CommissionSettings>('/comandas/settings')).data;
export const salvarRegraComissao = async (r: CommissionSettings) =>
  (await api.put<CommissionSettings>('/comandas/settings', r)).data;

const codigoConflito = (error: unknown): string | undefined =>
  error instanceof AxiosError && error.response?.status === 409
    ? (error.response.data as { errorCode?: string } | undefined)?.errorCode
    : undefined;

/** O caixa de hoje ainda não foi aberto. */
export const ehCaixaFechado = (error: unknown): boolean => codigoConflito(error) === 'CASH_CLOSED';
/** O caixa de hoje já foi aberto e fechado. */
export const ehCaixaJaFechado = (error: unknown): boolean => codigoConflito(error) === 'CASH_ALREADY_CLOSED';
