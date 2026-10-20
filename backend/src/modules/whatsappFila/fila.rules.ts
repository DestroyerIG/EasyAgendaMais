import { todayInTimezone, zonedToUtc } from '../../utils/businessDate.js';

export const INTERVALO_MIN_S = 45;
export const INTERVALO_MAX_S = 90;
export const LIMITE_POR_HORA = 25;
export const JANELA_INICIO = '08:00';
export const JANELA_FIM = '20:00';
/** Média usada só para estimar a previsão de cada posição da fila. */
const MEDIA_POR_POSICAO_S = 75;

export function sortearIntervalo(rand: () => number = Math.random): number {
  return INTERVALO_MIN_S + Math.floor(rand() * (INTERVALO_MAX_S - INTERVALO_MIN_S + 1));
}

function minutosLocais(agora: Date, tz: string): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', hour: 'numeric', minute: 'numeric',
  }).formatToParts(agora).map((x) => [x.type, Number(x.value)]));
  return p.hour * 60 + p.minute;
}

const paraMinutos = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export function dentroDaJanela(agora: Date, tz: string): boolean {
  const m = minutosLocais(agora, tz);
  return m >= paraMinutos(JANELA_INICIO) && m < paraMinutos(JANELA_FIM);
}

const somaDias = (ymd: string, dias: number): string => {
  const [y, mo, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d + dias)).toISOString().slice(0, 10);
};

export function proximaAberturaDaJanela(agora: Date, tz: string): Date {
  if (dentroDaJanela(agora, tz)) return agora;
  const hoje = todayInTimezone(tz, agora);
  const antesDeAbrir = minutosLocais(agora, tz) < paraMinutos(JANELA_INICIO);
  return zonedToUtc(antesDeAbrir ? hoje : somaDias(hoje, 1), JANELA_INICIO, tz);
}

type Ultimo = { em: Date; intervaloS: number } | null;

export function podeEnviarAgora(a: { agora: Date; tz: string; ultimo: Ultimo; enviadosUltimaHora: number }): boolean {
  if (!dentroDaJanela(a.agora, a.tz)) return false;
  if (a.enviadosUltimaHora >= LIMITE_POR_HORA) return false;
  if (a.ultimo && a.agora.getTime() < a.ultimo.em.getTime() + a.ultimo.intervaloS * 1000) return false;
  return true;
}

/**
 * Estimativa de quando a posição `posicao` (0 = próxima) sai: 75 s por posição, só dentro da janela.
 * Em cada dia cabem as posições cujo horário (início + 75 s × índice) ainda é anterior ao fim da janela;
 * as que sobram seguem para o próximo dia a partir das 08:00.
 */
export function previsaoDeEnvio(a: { agora: Date; tz: string; posicao: number; ultimo: Ultimo }): Date {
  let inicio = a.agora;
  if (a.ultimo) inicio = new Date(Math.max(inicio.getTime(), a.ultimo.em.getTime() + a.ultimo.intervaloS * 1000));
  let restantes = a.posicao;
  for (let guarda = 0; guarda < 400; guarda++) {
    inicio = proximaAberturaDaJanela(inicio, a.tz);
    const fimDaJanela = zonedToUtc(todayInTimezone(a.tz, inicio), JANELA_FIM, a.tz);
    const sobraS = (fimDaJanela.getTime() - inicio.getTime()) / 1000;
    const cabem = Math.ceil(sobraS / MEDIA_POR_POSICAO_S);
    if (restantes < cabem) return new Date(inicio.getTime() + restantes * MEDIA_POR_POSICAO_S * 1000);
    restantes -= cabem;
    inicio = fimDaJanela;
  }
  return inicio;
}
