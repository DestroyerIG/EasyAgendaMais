// `cents: false` (padrão true, igual ao comportamento anterior desta função em todo
// o resto do app) omite os centavos — usado na tela Hoje, cujas referências do
// Stitch nunca mostram centavos em nenhum valor monetário.
export const formatCurrency = (value: number, options?: { cents?: boolean }): string => {
  const cents = options?.cents ?? true;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(value);
};

export const formatPhone = (phone: string): string => {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
  }
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
};

export const formatNumber = (value: number): string => {
  return new Intl.NumberFormat('pt-BR').format(value);
};

/**
 * Duração de um serviço por extenso: "30 min", "1 hora", "1 hora e 20 min", "2 horas".
 * Usada onde a duração do serviço aparece fora de telas com referência no Stitch
 * (Ajustes › Serviços e equipe, seletor de serviço do Novo Agendamento) — pedido do
 * usuário para não mostrar direto em minutos a partir de 1 hora.
 */
export const formatDurationExtenso = (minutos: number): string => {
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas === 0) return `${minutos} min`;
  const rotuloHoras = `${horas} hora${horas > 1 ? 's' : ''}`;
  return resto === 0 ? rotuloHoras : `${rotuloHoras} e ${resto} min`;
};

/**
 * Lê um valor em reais digitado no padrão brasileiro. Aceita "1250", "1.250", "1.250,50",
 * "1250,5", "R$ 12,00" e também "12.5" (um único ponto seguido de 1 ou 2 dígitos é decimal).
 * Devolve null para texto vazio, negativo ou que não seja um valor.
 */
export const parseValorBR = (texto: string): number | null => {
  const t = texto.replace(/r\$/gi, '').replace(/\s+/g, '');
  if (t === '') return null;
  const inteiro = /^(\d+|\d{1,3}(\.\d{3})+)$/;
  let normalizado: string;
  if (t.includes(',')) {
    const partes = t.split(',');
    if (partes.length !== 2) return null;
    const [int, dec] = partes as [string, string];
    if (!inteiro.test(int) || !/^\d{1,2}$/.test(dec)) return null;
    normalizado = `${int.replace(/\./g, '')}.${dec}`;
  } else if (/^\d+\.\d{1,2}$/.test(t)) {
    normalizado = t;
  } else if (inteiro.test(t)) {
    normalizado = t.replace(/\./g, '');
  } else {
    return null;
  }
  const v = Number(normalizado);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
};

// Fuso do salão: os instantes UTC da API (linha do tempo, consentimento, fotos, ficha
// técnica) são mostrados no horário de Brasília, não no fuso do navegador.
export const FUSO_NEGOCIO = 'America/Sao_Paulo';
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const partesNoFuso = (iso: string) => {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: FUSO_NEGOCIO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const p = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((x) => x.type === tipo)?.value ?? '';
  return { ano: p('year'), mes: p('month'), dia: p('day'), hora: p('hour'), minuto: p('minute') };
};

/** Instante ISO → "12/03/2026" no fuso do salão. */
export const formatDataNegocio = (iso: string): string => {
  const d = partesNoFuso(iso);
  return `${d.dia}/${d.mes}/${d.ano}`;
};

/**
 * Data pura "YYYY-MM-DD" (coluna @db.Date) → "12/03/2026", sem converter fuso:
 * a string já é o dia do negócio. Instantes ISO continuam em `formatDataNegocio`.
 */
export const formatDataPura = (data: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(data);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : data;
};

/** Instante ISO → "12 set · 10:00" no fuso do salão (com o ano quando não é o atual). */
export const formatDataHoraNegocio = (iso: string): string => {
  const d = partesNoFuso(iso);
  const anoAtual = partesNoFuso(new Date().toISOString()).ano;
  const dia = `${Number(d.dia)} ${MESES_CURTOS[Number(d.mes) - 1]}${d.ano !== anoAtual ? ` ${d.ano}` : ''}`;
  return `${dia} · ${d.hora}:${d.minuto}`;
};

/** Ano corrente no fuso do salão. */
export const anoAtualNegocio = (): number => Number(partesNoFuso(new Date().toISOString()).ano);
