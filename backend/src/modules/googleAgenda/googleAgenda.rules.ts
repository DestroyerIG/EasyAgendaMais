import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { FEATURE_REQUIREMENTS, PLAN_LEVELS, normalizePlan } from '../../config/planPermissions.js';
import { chaveDoToken } from './googleAgenda.crypto.js';
import type { EventoGoogle } from './googleAgenda.api.js';
import type { OrigemGoogle } from './googleAgenda.types.js';

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
export function assinarState(
  userId: string, para: Para, agora: number = Date.now(), origem: OrigemGoogle = 'ajustes',
): string {
  const carga = Buffer.from(JSON.stringify({
    u: userId, p: para, o: origem, n: randomBytes(12).toString('base64url'), e: agora + VALIDADE_STATE_MS,
  })).toString('base64url');
  return `${carga}.${assinar(carga)}`;
}

export function lerState(
  state: string, agora: number = Date.now(),
): { userId: string; para: Para; origem: OrigemGoogle } | null {
  const [carga, assinatura] = state.split('.');
  if (!carga || !assinatura) return null;
  const esperada = Buffer.from(assinar(carga));
  const recebida = Buffer.from(assinatura);
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null;
  try {
    const d = JSON.parse(Buffer.from(carga, 'base64url').toString('utf8')) as { u: string; p: Para; o?: string; n: string; e: number };
    limparNonces(agora);
    if (d.e < agora || noncesUsados.has(d.n)) return null;
    if (d.p !== 'negocio' && d.p !== 'profissional') return null;
    noncesUsados.set(d.n, d.e);
    return { userId: d.u, para: d.p, origem: d.o === 'onboarding' ? 'onboarding' : 'ajustes' };
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

// ─── Saída: agendamentos para o Google ──────────────────────────────────────────

export interface AgendamentoSync {
  id: string;
  businessId: string;
  professionalId: string;
  status: string;
  updatedAt: Date;
  /** Coluna DATE (meia-noite UTC) e TIME (1970-01-01 em UTC), como o Prisma devolve. */
  date: Date;
  time: Date;
  client: { name: string };
  service: { name: string; durationMinutes: number };
  professional: { name: string };
}

export interface ConexaoSync {
  id: string;
  businessId: string;
  tipo: string;
  professionalId: string | null;
  status: string;
  business: { plan: string };
}

/** Cancelado some do Google; os outros status continuam lá. */
export const deveTerEvento = (status: string) => status !== 'cancelado';

/** A do negócio vê todos; a da profissional, só os dela. Só conexões efetivamente ativas. */
export function conexoesQueVeem<C extends ConexaoSync>(ag: { businessId: string; professionalId: string }, conexoes: C[]): C[] {
  return conexoes.filter((c) => c.businessId === ag.businessId
    && conexaoEfetiva(c, c.business.plan) === 'ativa'
    && (c.tipo === 'negocio' || c.professionalId === ag.professionalId));
}

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || nome;
// Data e hora "de parede" do negócio, sem fuso: o Google aplica o timeZone do evento.
const local = (d: Date) => d.toISOString().slice(0, 19);

export function montarEvento(
  ag: AgendamentoSync,
  tipo: string,
  ctx: { fuso: string; frontendUrl: string },
): EventoGoogle {
  const inicio = new Date(Date.UTC(
    ag.date.getUTCFullYear(), ag.date.getUTCMonth(), ag.date.getUTCDate(), ag.time.getUTCHours(), ag.time.getUTCMinutes(),
  ));
  const fim = new Date(inicio.getTime() + ag.service.durationMinutes * 60_000);
  const partes = [primeiroNome(ag.client.name), ag.service.name];
  if (tipo === 'negocio') partes.push(ag.professional.name);
  return {
    titulo: partes.join(' · '),
    descricao: `Ver no EasyAgenda+: ${ctx.frontendUrl}/agendamentos?id=${ag.id}`,
    inicio: local(inicio),
    fim: local(fim),
    fuso: ctx.fuso,
  };
}

// ─── Entrada: ocupado do Google ─────────────────────────────────────────────────

/** "YYYY-MM-DD HH:mm" do instante no fuso do negócio. */
function relogioNoFuso(d: Date, fuso: string): { dia: string; hora: string } {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}

/** Recorta os ocupados ao dia pedido, em HH:mm do fuso do negócio (formato do blockedRanges). */
export function faixasDoDia(
  ocupados: Array<{ inicio: Date; fim: Date }>, data: string, fuso: string,
): Array<{ start: string; end: string }> {
  const faixas: Array<{ start: string; end: string }> = [];
  for (const o of ocupados) {
    const ini = relogioNoFuso(o.inicio, fuso);
    const fim = relogioNoFuso(o.fim, fuso);
    if (fim.dia < data || ini.dia > data) continue;
    const start = ini.dia < data ? '00:00' : ini.hora;
    const end = fim.dia > data ? '23:59' : fim.hora;
    if (start < end) faixas.push({ start, end });
  }
  return faixas;
}
