import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { FEATURE_REQUIREMENTS, PLAN_LEVELS, normalizePlan } from '../../config/planPermissions.js';
import { chaveDoToken } from './googleAgenda.crypto.js';

// Regras puras do Google Agenda (fase 7).

export type Para = 'negocio' | 'profissional';
export type StatusEfetivo = 'ativa' | 'reconectar' | 'pausada_plano';

const VALIDADE_STATE_MS = 10 * 60 * 1000;

// Uso único do state: o servidor roda numa instância só, então basta a memória. Se passar a ter
// mais de uma, isto precisa ir para o banco.
const noncesUsados = new Map<string, number>();

function limparNonces(agora: number) {
  for (const [nonce, exp] of noncesUsados) if (exp < agora) noncesUsados.delete(nonce);
}

const assinar = (carga: string) => createHmac('sha256', chaveDoToken()).update(carga).digest('base64url');

/** State do OAuth: quem conectou e para quê, assinado, válido por 10 minutos e de uso único. */
export function assinarState(userId: string, para: Para, agora: number = Date.now()): string {
  const carga = Buffer.from(JSON.stringify({
    u: userId, p: para, n: randomBytes(12).toString('base64url'), e: agora + VALIDADE_STATE_MS,
  })).toString('base64url');
  return `${carga}.${assinar(carga)}`;
}

export function lerState(state: string, agora: number = Date.now()): { userId: string; para: Para } | null {
  const [carga, assinatura] = state.split('.');
  if (!carga || !assinatura) return null;
  const esperada = Buffer.from(assinar(carga));
  const recebida = Buffer.from(assinatura);
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null;
  try {
    const d = JSON.parse(Buffer.from(carga, 'base64url').toString('utf8')) as { u: string; p: Para; n: string; e: number };
    limparNonces(agora);
    if (d.e < agora || noncesUsados.has(d.n)) return null;
    if (d.p !== 'negocio' && d.p !== 'profissional') return null;
    noncesUsados.set(d.n, d.e);
    return { userId: d.u, para: d.p };
  } catch {
    return null;
  }
}

/** A conexão da profissional para quando o plano perde o app da profissional; a da dona nunca para. */
export function conexaoEfetiva(c: { tipo: string; status: string }, plano: unknown): StatusEfetivo {
  if (c.status === 'reconectar') return 'reconectar';
  if (c.tipo === 'profissional'
    && PLAN_LEVELS[normalizePlan(plano)] < PLAN_LEVELS[FEATURE_REQUIREMENTS.app_profissional]) {
    return 'pausada_plano';
  }
  return 'ativa';
}
