import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { GatewayId, PagamentoGateway, SituacaoCobranca } from './recebimentos.types.js';

// Regras puras dos recebimentos automáticos (Mercado Pago).

/** Sem as quatro variáveis, Recebimentos some das telas e nada é chamado. */
export function recebimentosConfigurado(): boolean {
  return Boolean(
    process.env.MERCADOPAGO_CLIENT_ID && process.env.MERCADOPAGO_CLIENT_SECRET
      && process.env.MERCADOPAGO_REDIRECT_URI && process.env.RECEBIMENTOS_TOKEN_KEY,
  );
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
export function assinarEstado(userId: string, gateway: GatewayId, agora: number = Date.now()): string {
  const carga = Buffer.from(JSON.stringify({
    u: userId, g: gateway, n: randomBytes(12).toString('base64url'), e: agora + VALIDADE_ESTADO_MS,
  })).toString('base64url');
  return `${carga}.${hmac(carga)}`;
}

export function lerEstado(estado: string, agora: number = Date.now()): { userId: string; gateway: GatewayId; nonce: string } | null {
  const [carga, assinatura] = estado.split('.');
  if (!carga || !assinatura) return null;
  const esperada = Buffer.from(hmac(carga));
  const recebida = Buffer.from(assinatura);
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null;
  try {
    const d = JSON.parse(Buffer.from(carga, 'base64url').toString('utf8')) as { u: string; g: GatewayId; n: string; e: number };
    limparNonces(agora);
    if (d.e < agora || noncesUsados.has(d.n)) return null;
    if (d.g !== 'mercadopago') return null;
    noncesUsados.set(d.n, d.e);
    return { userId: d.u, gateway: d.g, nonce: d.n };
  } catch {
    return null;
  }
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
  if (pagamento.status === 'refunded') return paga ? 'marcar_devolvida' : 'ignorar';
  if (pagamento.status === 'charged_back') return paga ? 'marcar_contestada' : 'ignorar';
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
