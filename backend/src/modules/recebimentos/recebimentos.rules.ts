import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { GatewayId, PagamentoGateway, SituacaoCobranca } from './recebimentos.types.js';

// Regras puras dos recebimentos automáticos (Mercado Pago).

/** Cada gateway só aparece e é chamado se as suas variáveis estiverem definidas. */
export function gatewayDisponivel(g: GatewayId): boolean {
  if (g === 'mercadopago') {
    return Boolean(
      process.env.MERCADOPAGO_CLIENT_ID && process.env.MERCADOPAGO_CLIENT_SECRET
        && process.env.MERCADOPAGO_REDIRECT_URI && process.env.RECEBIMENTOS_TOKEN_KEY,
    );
  }
  return Boolean(process.env.RECEBIMENTOS_TOKEN_KEY && process.env.BACKEND_URL);
}

const TODOS_GATEWAYS: GatewayId[] = ['mercadopago', 'infinitepay'];

/** Algum gateway disponível. Sem nenhum, Recebimentos some das telas. */
export function recebimentosConfigurado(): boolean {
  return TODOS_GATEWAYS.some(gatewayDisponivel);
}

/** Gateways disponíveis agora. */
export function gatewaysDisponiveis(): GatewayId[] {
  return TODOS_GATEWAYS.filter(gatewayDisponivel);
}

/** Nome do gateway para mostrar ao usuário. */
export function nomeDoGateway(g: GatewayId): string {
  return g === 'infinitepay' ? 'InfinitePay' : 'Mercado Pago';
}

/** URL pública do backend, sem barra final. */
export function backendUrl(): string {
  return (process.env.BACKEND_URL ?? '').replace(/\/+$/, '');
}

export function chaveRecebimentos(): Buffer {
  const chave = Buffer.from(process.env.RECEBIMENTOS_TOKEN_KEY ?? '', 'base64');
  if (chave.length !== 32) throw new Error('RECEBIMENTOS_TOKEN_KEY precisa ter 32 bytes em base64');
  return chave;
}

// ─── Estado do OAuth e PKCE ─────────────────────────────────────────────────────

const VALIDADE_ESTADO_MS = 10 * 60 * 1000;

// Uso único do estado: o servidor roda numa instância só, então basta a memória.
const noncesUsados = new Map<string, number>();

function limparNonces(agora: number) {
  for (const [nonce, exp] of noncesUsados) if (exp < agora) noncesUsados.delete(nonce);
}

const hmac = (carga: string) => createHmac('sha256', chaveRecebimentos()).update(carga).digest('base64url');

/** Estado do OAuth: quem conectou e com qual gateway, assinado, válido por 10 minutos e de uso único. */
export type OrigemConexao = 'ajustes' | 'onboarding';

export function assinarEstado(
  userId: string, gateway: GatewayId, agora: number = Date.now(), origem: OrigemConexao = 'ajustes',
): string {
  const carga = Buffer.from(JSON.stringify({
    u: userId, g: gateway, n: randomBytes(12).toString('base64url'), e: agora + VALIDADE_ESTADO_MS, o: origem,
  })).toString('base64url');
  return `${carga}.${hmac(carga)}`;
}

export function lerEstado(
  estado: string, agora: number = Date.now(),
): { userId: string; gateway: GatewayId; nonce: string; origem: OrigemConexao } | null {
  const [carga, assinatura] = estado.split('.');
  if (!carga || !assinatura) return null;
  const esperada = Buffer.from(hmac(carga));
  const recebida = Buffer.from(assinatura);
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null;
  try {
    const d = JSON.parse(Buffer.from(carga, 'base64url').toString('utf8')) as { u: string; g: GatewayId; n: string; e: number; o?: string };
    limparNonces(agora);
    if (d.e < agora || noncesUsados.has(d.n)) return null;
    if (d.g !== 'mercadopago') return null;
    noncesUsados.set(d.n, d.e);
    return { userId: d.u, gateway: d.g, nonce: d.n, origem: d.o === 'onboarding' ? 'onboarding' : 'ajustes' };
  } catch {
    return null;
  }
}

/** Nonce de um estado recém-assinado, para derivar o desafio PKCE sem consumir o estado. */
export function nonceDoEstado(estado: string): string {
  const carga = estado.split('.')[0] ?? '';
  return (JSON.parse(Buffer.from(carga, 'base64url').toString('utf8')) as { n: string }).n;
}

/** Verificador PKCE derivado do nonce: sobrevive a um reinício sem guardar estado. */
export const verificadorPkce = (nonce: string): string => hmac(`pkce:${nonce}`);

export const desafioPkce = (verificador: string): string =>
  createHash('sha256').update(verificador).digest('base64url');

// ─── Dinheiro e token ───────────────────────────────────────────────────────────

/** Valor em centavos inteiros. Aceita Decimal do Prisma, texto e número. */
export function centavos(v: unknown): number {
  return Math.round(Number(String(v)) * 100);
}

/** Valor em reais para mostrar em alertas. */
export function reais(v: unknown): string {
  return (centavos(v) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** O horário da reserva já passou no fuso do negócio. O minuto em curso ainda vale, como na lista de horários. */
export function horarioJaPassou(dia: string, hora: string, agora: Date, timeZone: string): boolean {
  const relogio = new Intl.DateTimeFormat('sv-SE', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(agora);
  return `${dia} ${hora.slice(0, 5)}` < relogio;
}

const DIA_MS = 24 * 60 * 60 * 1000;

/** Renova o token a menos de 30 dias do vencimento. */
export function tokenPertoDeVencer(expiraEm: Date, agora: Date): boolean {
  return expiraEm.getTime() - agora.getTime() < 30 * DIA_MS;
}

// ─── Decisão sobre um pagamento ─────────────────────────────────────────────────

export type Decisao =
  | 'ignorar' | 'confirmar' | 'reativar' | 'alertar_atrasado' | 'alertar_duplicado'
  | 'marcar_recusada' | 'marcar_devolvida' | 'marcar_contestada';

export interface EntradaDecisao {
  cobranca: { id: string; situacao: SituacaoCobranca | string; valor: unknown; pagamentoExternoId: string | null };
  pagamento: PagamentoGateway;
  reserva: { status: string; expiresAt: Date | null };
  /** Outra cobrança da mesma reserva já paga. */
  outraCobrancaPaga: boolean;
  agora: Date;
}

/**
 * Cobrança `expirada` com reserva `cancelado` identifica o cancelamento por vencimento, porque a
 * rotina marca os dois juntos. Cancelamento feito por pessoa nunca é revertido.
 */
export function decidirPagamento(e: EntradaDecisao): Decisao {
  const { cobranca, pagamento, reserva } = e;
  if (pagamento.referencia !== cobranca.id) return 'ignorar';

  const paga = cobranca.situacao === 'paga';
  // Não olha a situação desta cobrança: o pagamento pode estar na linha do repetido. Quem confere é marcarEstorno.
  if (pagamento.status === 'refunded') return 'marcar_devolvida';
  if (pagamento.status === 'charged_back') return 'marcar_contestada';
  if (pagamento.status === 'rejected') return paga ? 'ignorar' : 'marcar_recusada';
  if (pagamento.status !== 'approved') return 'ignorar';

  if (centavos(pagamento.valor) !== centavos(cobranca.valor)) return 'ignorar';

  if (paga) return cobranca.pagamentoExternoId === pagamento.id ? 'ignorar' : 'alertar_duplicado';
  if (e.outraCobrancaPaga || ['confirmado', 'em_atendimento', 'concluido'].includes(reserva.status)) {
    return 'alertar_duplicado';
  }

  if (reserva.status === 'aguardando_pagamento') {
    const vencida = reserva.expiresAt !== null && reserva.expiresAt.getTime() < e.agora.getTime();
    return vencida ? 'reativar' : 'confirmar';
  }
  if (reserva.status === 'cancelado' && cobranca.situacao === 'expirada') return 'reativar';
  return 'alertar_atrasado';
}

// ─── Decisão sobre um pagamento do saldo da comanda ─────────────────────────────

export type DecisaoSaldo =
  | 'ignorar' | 'quitar' | 'marcar_recusada' | 'marcar_cancelada' | 'marcar_devolvida' | 'marcar_contestada'
  | 'alertar_duplicado' | 'alertar_valor_diferente';

/**
 * Saldo do balcão: não há reserva a confirmar, então a regra é mais curta que a do sinal. Pagamento
 * aprovado quita mesmo numa cobrança vencida ou substituída (o dinheiro entrou); valor diferente do
 * saldo não quita e alerta, em vez de ser ignorado como no sinal.
 */
export function decidirSaldo(e: {
  cobranca: { id: string; situacao: string; valor: unknown; pagamentoExternoId: string | null };
  pagamento: PagamentoGateway;
}): DecisaoSaldo {
  const { cobranca, pagamento } = e;
  if (pagamento.referencia !== cobranca.id) return 'ignorar';

  if (pagamento.status === 'refunded') return 'marcar_devolvida';
  if (pagamento.status === 'charged_back') return 'marcar_contestada';
  if (pagamento.status === 'rejected') return cobranca.situacao === 'pendente' ? 'marcar_recusada' : 'ignorar';
  // Ordem cancelada ou vencida na maquininha: a cobrança pendente sai de cena e a comanda destrava na hora.
  if (pagamento.status === 'cancelled' || pagamento.status === 'expired') return cobranca.situacao === 'pendente' ? 'marcar_cancelada' : 'ignorar';
  if (pagamento.status !== 'approved') return 'ignorar';

  if (cobranca.situacao === 'paga') return cobranca.pagamentoExternoId === pagamento.id ? 'ignorar' : 'alertar_duplicado';
  if (centavos(pagamento.valor) !== centavos(cobranca.valor)) return 'alertar_valor_diferente';
  return 'quitar';
}
