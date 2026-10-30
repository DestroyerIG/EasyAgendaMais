import { FUSO_NEGOCIO } from '@/lib/formatters';

const umaCasa = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const SEM_DADO = '—';

/** 28.6 → "28,6%"; null → "—". */
export const pct = (valor: number | null): string => (valor === null ? SEM_DADO : `${umaCasa.format(valor)}%`);

/** Variação com sinal: 12.4 → "+12,4%", -3 → "-3,0%"; null → "—". */
export const pctComSinal = (valor: number | null): string =>
  valor === null ? SEM_DADO : `${valor > 0 ? '+' : ''}${umaCasa.format(valor)}%`;

/** Diferença em pontos percentuais: 3.6 → "+3,6 p.p."; null → "—". */
export const pontos = (valor: number | null): string =>
  valor === null ? SEM_DADO : `${valor > 0 ? '+' : ''}${umaCasa.format(valor)} p.p.`;

/** Instante ISO → "13:05" no fuso de São Paulo. */
export const horaMinuto = (iso: string): string =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO_NEGOCIO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    new Date(iso),
  );

/** Tempo desde `iso` até `agora`: "menos de 1 h", "5 h", "1 dia", "12 dias". */
export const tempoDesde = (iso: string, agora: Date = new Date()): string => {
  const horas = Math.max(0, Math.floor((agora.getTime() - new Date(iso).getTime()) / 3_600_000));
  if (horas < 1) return 'menos de 1 h';
  if (horas < 24) return `${horas} h`;
  const dias = Math.floor(horas / 24);
  return `${dias} ${dias === 1 ? 'dia' : 'dias'}`;
};

/** Classe da caixa de cada cartão da visão geral (Stitch: superfície, cantos de 16 px, sombra leve). */
export const CAIXA = 'rounded-card border border-line bg-surface shadow-sm';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Instante ISO → "mar/2026" no fuso de São Paulo. */
export const mesAno = (iso: string): string => {
  const partes = new Intl.DateTimeFormat('en-GB', { timeZone: FUSO_NEGOCIO, year: 'numeric', month: '2-digit' }).formatToParts(
    new Date(iso),
  );
  const mes = Number(partes.find((p) => p.type === 'month')?.value);
  const ano = partes.find((p) => p.type === 'year')?.value ?? '';
  return `${MESES[mes - 1] ?? ''}/${ano}`;
};

/** Salva um Blob (CSV exportado) como arquivo no navegador. */
export function salvarArquivo(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
