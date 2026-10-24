import type { PlanId } from '@/lib/plans';
import type { StatusFatura, SubscriptionStatus } from '@/lib/billing';

// Textos e formatos das telas Plano e cobrança e Comparação (2D).

export const NOME_PLANO: Record<PlanId, string> = {
  basico: 'Solo',
  profissional: 'Equipe',
  premium: 'Salão',
};

export const ORDEM_PLANOS: PlanId[] = ['basico', 'profissional', 'premium'];

export const nivelPlano = (plano: PlanId): number => ORDEM_PLANOS.indexOf(plano);

export const STATUS_ASSINATURA: Record<SubscriptionStatus, string> = {
  active: 'Assinatura ativa',
  trialing: 'Período de teste',
  pending: 'Pagamento pendente',
  past_due: 'Pagamento atrasado',
  unpaid: 'Pagamento em atraso',
  canceled: 'Assinatura cancelada',
  incomplete: 'Cadastro incompleto',
};

export const SEM_PAGAMENTO: SubscriptionStatus[] = ['pending', 'past_due', 'unpaid', 'incomplete'];

export const STATUS_FATURA: Record<StatusFatura, { rotulo: string; classe: string }> = {
  pago: { rotulo: 'Pago', classe: 'bg-success/12 text-success-text' },
  em_aberto: { rotulo: 'Em aberto', classe: 'bg-warning/12 text-warning-text' },
  vencido: { rotulo: 'Vencido', classe: 'bg-danger/12 text-danger' },
  cancelado: { rotulo: 'Cancelado', classe: 'bg-surface-2 text-muted' },
  estornado: { rotulo: 'Estornado', classe: 'bg-surface-2 text-muted' },
};

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const data = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

// "15 de outubro de 2026"
export const dataLonga = (iso: string | null | undefined): string | null => {
  const d = data(iso);
  return d ? new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }).format(d) : null;
};

// "15/out/2026"
export const dataFatura = (iso: string): string => {
  const d = data(iso);
  if (!d) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${MESES_CURTOS[d.getMonth()]}/${d.getFullYear()}`;
};

// "15/set a 14/out de 2026"
export const periodoFatura = (inicio: string | null, fim: string | null): string | null => {
  const a = data(inicio);
  const b = data(fim);
  if (!a || !b) return null;
  return `${a.getDate()}/${MESES_CURTOS[a.getMonth()]} a ${b.getDate()}/${MESES_CURTOS[b.getMonth()]} de ${b.getFullYear()}`;
};

// "15/11"
export const diaMes = (iso: string | null | undefined): string | null => {
  const d = data(iso);
  return d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` : null;
};

export const diasAte = (iso: string | null | undefined, agora: number = Date.now()): number | null => {
  const d = data(iso);
  return d ? Math.max(0, Math.ceil((d.getTime() - agora) / (24 * 60 * 60 * 1000))) : null;
};

// Véspera da próxima cobrança: último dia de acesso depois de cancelar.
export const vespera = (iso: string | null | undefined): string | null => {
  const d = data(iso);
  if (!d) return null;
  d.setDate(d.getDate() - 1);
  return dataLonga(d.toISOString());
};

// Número de suporte do financeiro (só dígitos). Sem a variável, os botões de suporte somem.
export const linkSuporteWhatsapp = (texto: string): string | null => {
  const numero = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || '').replace(/\D/g, '');
  return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(texto)}` : null;
};
