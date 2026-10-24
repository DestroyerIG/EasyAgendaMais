import { todayInTimezone, zonedToUtc } from '../../utils/businessDate.js';

// Períodos de relatório em dias de parede do negócio (YYYY-MM-DD, fim incluído).

export interface Periodo { inicio: string; fim: string }

const DIA = 24 * 60 * 60 * 1000;
const utc = (d: string) => Date.parse(`${d}T00:00:00Z`);
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const somarDias = (d: string, n: number): string => ymd(utc(d) + n * DIA);
export const diasEntre = (a: string, b: string): number => Math.round((utc(b) - utc(a)) / DIA);
export const diasNoPeriodo = (p: Periodo): number => diasEntre(p.inicio, p.fim) + 1;

export const ultimoDiaDoMes = (d: string): string => {
  const [y, m] = d.split('-').map(Number);
  return ymd(Date.UTC(y, m, 0));
};

export const mesDe = (d: string): Periodo => ({ inicio: `${d.slice(0, 7)}-01`, fim: ultimoDiaDoMes(d) });
export const mesAnterior = (d: string): Periodo => mesDe(somarDias(`${d.slice(0, 7)}-01`, -1));

// Quinzenas: 1 a 15 e 16 ao fim do mês.
export const quinzenaDe = (d: string): Periodo => {
  const mes = d.slice(0, 7);
  return Number(d.slice(8, 10)) <= 15
    ? { inicio: `${mes}-01`, fim: `${mes}-15` }
    : { inicio: `${mes}-16`, fim: ultimoDiaDoMes(d) };
};

export const ultimos30 = (hoje: string): Periodo => ({ inicio: somarDias(hoje, -29), fim: hoje });

// Período de mesmo tamanho que termina na véspera do início.
export const periodoAnterior = (p: Periodo): Periodo => {
  const n = diasNoPeriodo(p);
  return { inicio: somarDias(p.inicio, -n), fim: somarDias(p.inicio, -1) };
};

export const datasDoPeriodo = (p: Periodo): string[] =>
  Array.from({ length: diasNoPeriodo(p) }, (_, i) => somarDias(p.inicio, i));

// Instantes UTC [gte, lt) que cobrem o período no fuso do negócio.
export const intervaloUtc = (p: Periodo, timezone: string): { gte: Date; lt: Date } => ({
  gte: zonedToUtc(p.inicio, '00:00', timezone),
  lt: zonedToUtc(somarDias(p.fim, 1), '00:00', timezone),
});

export const diaNoFuso = (instante: Date, timezone: string): string => todayInTimezone(timezone, instante);

// 0 = domingo … 6 = sábado
export const diaDaSemana = (d: string): number => new Date(utc(d)).getUTCDay();
export const CHAVE_DIA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'] as const;
export type ChaveDia = (typeof CHAVE_DIA)[number];
