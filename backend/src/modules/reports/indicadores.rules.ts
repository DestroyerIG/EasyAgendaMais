import { CHAVE_DIA, type ChaveDia, type Periodo, datasDoPeriodo, diaDaSemana, diasEntre, diasNoPeriodo } from './periodo.js';

// Indicadores da tela Relatórios (sub-projeto 3). Funções puras; valores em centavos.

export const variacao = (atual: number | null, anterior: number | null): number | null =>
  atual === null || anterior === null || anterior === 0 ? null : Math.round(((atual - anterior) / anterior) * 1000) / 10;

export const ticketMedio = (faturamentoCents: number, comandas: number): number | null =>
  comandas > 0 ? Math.round(faturamentoCents / comandas) : null;

export const taxaFaltas = (concluidos: number, faltas: number): number | null =>
  concluidos + faltas > 0 ? Math.round((faltas / (concluidos + faltas)) * 1000) / 10 : null;

export const BASE_MINIMA_RETORNO = 5;
export const TOLERANCIA_CICLO = 1.2;

// Clientes atendidas no período que já tinham ciclo médio (2+ visitas antes) e voltaram
// até ciclo × 1,2 depois da visita anterior. `visitas` são as datas concluídas, ordenadas.
export function retornoNoCiclo(visitasPorCliente: Map<string, string[]>, p: Periodo): { taxa: number | null; base: number } {
  let base = 0;
  let noCiclo = 0;
  for (const datas of visitasPorCliente.values()) {
    const i = datas.findIndex((d) => d >= p.inicio && d <= p.fim);
    if (i < 2) continue;
    const antes = datas.slice(0, i);
    const intervalos = antes.slice(1).map((d, k) => diasEntre(antes[k], d));
    const ciclo = intervalos.reduce((s, x) => s + x, 0) / intervalos.length;
    base++;
    if (diasEntre(antes[i - 1], datas[i]) <= ciclo * TOLERANCIA_CICLO) noCiclo++;
  }
  return { taxa: base >= BASE_MINIMA_RETORNO ? Math.round((noCiclo / base) * 100) : null, base };
}

export const diasAbertosNoMes = (mes: Periodo, abertos: Record<string, boolean>): number =>
  datasDoPeriodo(mes).filter((d) => abertos[CHAVE_DIA[diaDaSemana(d)]]).length;

export const metaMensal = (metaDiaria: number | null, mes: Periodo, abertos: Record<string, boolean>): number | null =>
  metaDiaria && metaDiaria > 0 ? Math.round(metaDiaria * 100) * diasAbertosNoMes(mes, abertos) : null;

// Projeção linear do mês: faturado até hoje ÷ dias decorridos × dias do mês.
export const projecaoDoMes = (faturadoCents: number, hoje: string, mes: Periodo): number => {
  const decorridos = diasEntre(mes.inicio, hoje) + 1;
  return Math.round((faturadoCents / decorridos) * diasNoPeriodo(mes));
};

// ─── Origem dos agendamentos ──────────────────────────────────────────────

export type Origem = 'publico' | 'whatsapp' | 'painel' | 'retorno_campanhas';
export const ORDEM_ORIGENS: Origem[] = ['publico', 'whatsapp', 'painel', 'retorno_campanhas'];
export const JANELA_ATRIBUICAO_DIAS = 7;

export function classificarOrigem(source: string | null, criadoEm: Date, enviosRecebidos: Date[]): Origem {
  const limite = criadoEm.getTime() - JANELA_ATRIBUICAO_DIAS * 24 * 60 * 60 * 1000;
  if (enviosRecebidos.some((e) => e.getTime() >= limite && e.getTime() <= criadoEm.getTime())) return 'retorno_campanhas';
  if (source === 'publico' || source === 'whatsapp') return source;
  return 'painel';
}

// ─── Mapa de ocupação ─────────────────────────────────────────────────────

export type Turno = 'manha' | 'tarde';
export const DIAS_MAPA: ChaveDia[] = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
const MEIO_DIA = 12 * 60;

const min = (hhmm: string) => {
  const [h = 0, m = 0] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const sobreposicao = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

export interface Expediente { openingTime: string; closingTime: string; diasAbertos: Record<string, boolean> }
export interface ProfissionalMapa { id: string; breakStart: string | null; breakEnd: string | null }
export interface AgendamentoMapa { professionalId: string; date: string; time: string; duracao: number }

export interface Celula { dia: ChaveDia; turno: Turno; agendado: number; disponivel: number; ocupacao: number | null }

const janelaTurno = (turno: Turno, e: Expediente): [number, number] => {
  const abre = min(e.openingTime);
  const fecha = min(e.closingTime);
  return turno === 'manha' ? [abre, Math.min(fecha, MEIO_DIA)] : [Math.max(abre, MEIO_DIA), fecha];
};

const pct = (agendado: number, disponivel: number) =>
  disponivel > 0 ? Math.min(100, Math.round((agendado / disponivel) * 100)) : null;

export function mapaOcupacao(
  p: Periodo, e: Expediente, profissionais: ProfissionalMapa[], agendamentos: AgendamentoMapa[],
): { linhas: { professionalId: string; celulas: Celula[] }[]; media: Celula[] } {
  const ocorrencias = new Map<ChaveDia, number>();
  for (const d of datasDoPeriodo(p)) {
    const chave = CHAVE_DIA[diaDaSemana(d)];
    ocorrencias.set(chave, (ocorrencias.get(chave) ?? 0) + 1);
  }
  const turnos: Turno[] = ['manha', 'tarde'];
  const media = new Map<string, Celula>();

  const linhas = profissionais.map((prof) => {
    const intervalo = prof.breakStart && prof.breakEnd ? [min(prof.breakStart), min(prof.breakEnd)] as const : null;
    const celulas: Celula[] = [];
    for (const dia of DIAS_MAPA) {
      for (const turno of turnos) {
        const [t0, t1] = janelaTurno(turno, e);
        const aberto = e.diasAbertos[dia] && t1 > t0;
        const porDia = aberto ? t1 - t0 - (intervalo ? sobreposicao(t0, t1, intervalo[0], intervalo[1]) : 0) : 0;
        const disponivel = porDia * (ocorrencias.get(dia) ?? 0);
        let agendado = 0;
        if (aberto) {
          for (const a of agendamentos) {
            if (a.professionalId !== prof.id || CHAVE_DIA[diaDaSemana(a.date)] !== dia) continue;
            const ini = min(a.time);
            agendado += sobreposicao(ini, ini + a.duracao, t0, t1);
          }
        }
        celulas.push({ dia, turno, agendado, disponivel, ocupacao: aberto ? pct(agendado, disponivel) : null });
        const chave = `${dia}:${turno}`;
        const m = media.get(chave) ?? { dia, turno, agendado: 0, disponivel: 0, ocupacao: null };
        m.agendado += agendado;
        m.disponivel += disponivel;
        media.set(chave, m);
      }
    }
    return { professionalId: prof.id, celulas };
  });

  const mediaLista = [...media.values()].map((c) => ({
    ...c,
    ocupacao: e.diasAbertos[c.dia] && c.disponivel > 0 ? pct(c.agendado, c.disponivel) : null,
  }));
  return { linhas, media: mediaLista };
}

export const MIN_DIAS_INSIGHT = 14;

const ROTULO_DIA: Record<ChaveDia, string> = {
  seg: 'Segunda', ter: 'Terça', qua: 'Quarta', qui: 'Quinta', sex: 'Sexta', sab: 'Sábado', dom: 'Domingo',
};
const ROTULO_TURNO: Record<Turno, string> = { manha: 'de manhã', tarde: 'à tarde' };
export const rotuloCelula = (c: Pick<Celula, 'dia' | 'turno'>) => `${ROTULO_DIA[c.dia]} ${ROTULO_TURNO[c.turno]}`;

const abertas = (media: Celula[]) => media.filter((c) => c.ocupacao !== null);

export function insightOcupacao(media: Celula[], p: Periodo): { texto: string; dia: ChaveDia; turno: Turno; ocupacao: number } | null {
  if (diasNoPeriodo(p) < MIN_DIAS_INSIGHT || !media.some((c) => c.agendado > 0)) return null;
  const vazia = abertas(media).sort((a, b) => (a.ocupacao ?? 0) - (b.ocupacao ?? 0))[0];
  if (!vazia || vazia.ocupacao === null) return null;
  return {
    texto: `${rotuloCelula(vazia)} está com ${vazia.ocupacao}% de ocupação. Que tal uma campanha para clientes que não vêm há mais de 30 dias?`,
    dia: vazia.dia, turno: vazia.turno, ocupacao: vazia.ocupacao,
  };
}

export function horarioDePico(media: Celula[]): { rotulo: string; ocupacao: number } | null {
  const cheia = abertas(media).filter((c) => c.agendado > 0).sort((a, b) => (b.ocupacao ?? 0) - (a.ocupacao ?? 0))[0];
  return cheia && cheia.ocupacao !== null ? { rotulo: rotuloCelula(cheia), ocupacao: cheia.ocupacao } : null;
}
