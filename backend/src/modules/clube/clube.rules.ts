import { diasEntre, somarDias } from '../reports/periodo.js';

// Regras puras do clube e dos pacotes (sub-projeto 4). Datas em dias de parede (YYYY-MM-DD).

export type TipoOferta = 'clube' | 'pacote';
export type StatusContrato = 'aguardando_pagamento' | 'ativo' | 'em_atraso' | 'cancelado' | 'concluido' | 'expirado';

/** Dias antes do vencimento em que a cobrança do ciclo seguinte é gerada e enviada. */
export const DIAS_ANTECEDENCIA_COBRANCA = 3;
/** Adesão pública sem pagamento é cancelada depois deste prazo. */
export const DIAS_ADESAO_PENDENTE = 7;

const cents = (v: number) => Math.round(v * 100);

/** Valor por sessão: preço ÷ sessões, arredondado para baixo no centavo. */
export function valorSessao(preco: number, sessoes: number): number {
  if (!(sessoes > 0)) return 0;
  return Math.floor(cents(preco) / sessoes) / 100;
}

/** Sessões que dividem o preço: pacote usa o total; clube usa o ciclo, ou a referência se for ilimitado. */
export function sessoesDoPreco(o: { tipo: TipoOferta; totalSessoes: number | null; sessoesPorCiclo: number | null; sessoesReferencia: number }): number {
  if (o.tipo === 'pacote') return o.totalSessoes ?? 0;
  return o.sessoesPorCiclo ?? o.sessoesReferencia;
}

const ultimoDia = (ano: number, mes0: number) => new Date(Date.UTC(ano, mes0 + 1, 0)).getUTCDate();

/** Soma `n` meses mantendo o dia âncora; dia 29 a 31 vira o último dia em meses mais curtos. */
export function somarMeses(data: string, n: number, diaAncora = Number(data.slice(8, 10))): string {
  const ano = Number(data.slice(0, 4));
  const mes0 = Number(data.slice(5, 7)) - 1 + n;
  const a = ano + Math.floor(mes0 / 12);
  const m = ((mes0 % 12) + 12) % 12;
  const d = Math.min(diaAncora, ultimoDia(a, m));
  return `${a}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Ciclo mensal que começa em `inicio`; o fim é a véspera do mesmo dia (âncora) no mês seguinte. */
export function cicloQueComecaEm(inicio: string, diaAncora: number): { inicio: string; fim: string } {
  return { inicio, fim: somarDias(somarMeses(inicio, 1, diaAncora), -1) };
}

/** Validade do pacote: da primeira sessão, ou da compra mais o dobro da validade se ainda não houve uso. */
export const validadeSemUso = (compra: string, validadeDias: number) => somarDias(compra, validadeDias * 2 - 1);
export const validadeDaPrimeiraSessao = (primeira: string, validadeDias: number) => somarDias(primeira, validadeDias - 1);

const dataBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export interface ContratoParaCobertura {
  id: string;
  tipo: TipoOferta;
  status: StatusContrato;
  nome: string;
  valorSessao: number;
  sessoesPorCiclo: number | null;
  totalSessoes: number | null;
  sessoesUsadas: number;
  intervaloMinimoDias: number;
  cicloInicio: string | null;
  cicloFim: string | null;
  validoAte: string | null;
  servicos: string[];
  profissionais: string[]; // vazio = todas
  usosNoCiclo: number;
  ultimoUso: string | null;
}

export type Cobertura =
  | { ok: true; contratoId: string; nome: string; tipo: TipoOferta; valorSessao: number; sessao: number; de: number | null; venceEm: string | null }
  | { ok: false; contratoId: string; nome: string; motivo: string };

/** Diz se o contrato cobre o serviço nesse dia e, se não, por quê (texto para a comanda). */
export function avaliarCobertura(c: ContratoParaCobertura, alvo: { data: string; serviceId: string; professionalId: string }): Cobertura {
  const nao = (motivo: string): Cobertura => ({ ok: false, contratoId: c.id, nome: c.nome, motivo });
  if (!c.servicos.includes(alvo.serviceId)) return nao('Serviço não incluso');
  if (c.profissionais.length > 0 && !c.profissionais.includes(alvo.professionalId)) return nao('Profissional não incluída');
  if (c.status === 'aguardando_pagamento') return nao('Aguardando o primeiro pagamento');
  if (c.status === 'concluido') return nao('Pacote sem saldo');
  if (c.status === 'expirado') return nao('Pacote vencido');

  if (c.tipo === 'clube') {
    if (!c.cicloInicio || !c.cicloFim) return nao('Aguardando o primeiro pagamento');
    if (c.status === 'cancelado' && alvo.data > c.cicloFim) return nao('Clube cancelado');
    if (c.status === 'em_atraso') return nao(`Clube em atraso desde ${dataBr(somarDias(c.cicloFim, 1))}`);
    if (alvo.data > c.cicloFim) return nao(`Mensalidade de ${dataBr(somarDias(c.cicloFim, 1))} aguardando pagamento`);
    if (alvo.data < c.cicloInicio) return nao('Fora do ciclo pago');
    if (c.sessoesPorCiclo !== null && c.usosNoCiclo >= c.sessoesPorCiclo) return nao('Sem saldo neste mês');
  } else {
    if (c.status === 'cancelado') return nao('Pacote cancelado');
    if (c.validoAte && alvo.data > c.validoAte) return nao('Pacote vencido');
    if (c.totalSessoes !== null && c.sessoesUsadas >= c.totalSessoes) return nao('Pacote sem saldo');
  }
  if (c.intervaloMinimoDias > 0 && c.ultimoUso && diasEntre(c.ultimoUso, alvo.data) < c.intervaloMinimoDias) {
    return nao(`Intervalo mínimo de ${c.intervaloMinimoDias} dias (liberado em ${dataBr(somarDias(c.ultimoUso, c.intervaloMinimoDias))})`);
  }
  const usadas = c.tipo === 'clube' ? c.usosNoCiclo : c.sessoesUsadas;
  return {
    ok: true, contratoId: c.id, nome: c.nome, tipo: c.tipo, valorSessao: c.valorSessao,
    sessao: usadas + 1, de: c.tipo === 'clube' ? c.sessoesPorCiclo : c.totalSessoes,
    venceEm: c.tipo === 'clube' ? c.cicloFim : c.validoAte,
  };
}

/**
 * Escolhe a cobertura: entre os contratos válidos, o que vence antes (sem data vai por último).
 * Sem nenhum válido, devolve o motivo do primeiro contrato que inclui o serviço, para a comanda explicar.
 */
export function escolherCobertura(avaliacoes: Cobertura[]): Cobertura | null {
  const validas = avaliacoes.filter((a): a is Extract<Cobertura, { ok: true }> => a.ok);
  if (validas.length > 0) {
    return [...validas].sort((a, b) => (a.venceEm ?? '9999-12-31').localeCompare(b.venceEm ?? '9999-12-31'))[0]!;
  }
  return avaliacoes.find((a) => !a.ok && a.motivo !== 'Serviço não incluso' && a.motivo !== 'Profissional não incluída') ?? null;
}

/** Saldo para exibir: "3 de 4 neste mês", "6 de 10", "Ilimitado". */
export function saldo(c: { tipo: TipoOferta; sessoesPorCiclo: number | null; totalSessoes: number | null; sessoesUsadas: number; usosNoCiclo: number }) {
  if (c.tipo === 'clube') {
    if (c.sessoesPorCiclo === null) return { restantes: null, total: null, usadas: c.usosNoCiclo };
    return { restantes: Math.max(0, c.sessoesPorCiclo - c.usosNoCiclo), total: c.sessoesPorCiclo, usadas: c.usosNoCiclo };
  }
  const total = c.totalSessoes ?? 0;
  return { restantes: Math.max(0, total - c.sessoesUsadas), total, usadas: c.sessoesUsadas };
}

/** Desconto da sócia nos itens não cobertos: o maior percentual entre os contratos válidos. */
export function descontoSocia(contratos: { valido: boolean; descontoExtrasPct: number }[]): number {
  return contratos.filter((c) => c.valido).reduce((m, c) => Math.max(m, c.descontoExtrasPct), 0);
}

/** Um contrato "conta" para o desconto e o selo se é utilizável no dia (ativo, ou cancelado ainda no ciclo pago). */
export function contratoVigente(c: { tipo: TipoOferta; status: StatusContrato; cicloFim: string | null; validoAte: string | null }, data: string): boolean {
  if (c.tipo === 'clube') {
    if (c.status === 'ativo') return !!c.cicloFim && data <= c.cicloFim;
    if (c.status === 'cancelado') return !!c.cicloFim && data <= c.cicloFim;
    return false;
  }
  return c.status === 'ativo' && (!c.validoAte || data <= c.validoAte);
}

/** Competência da cobrança = início do ciclo que ela paga. Vence no próprio início. */
export const competenciaDoCiclo = (cicloInicio: string) => cicloInicio;
