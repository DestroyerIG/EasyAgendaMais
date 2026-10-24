// Apuração das comissões e consumo dos adiantamentos (sub-projeto 3). Tudo em centavos;
// os valores de comissão vêm prontos da comanda fechada, nada é recalculado aqui.

export type ModeloRepasse = 'comissao' | 'salao_parceiro';

export interface ComandaApurada {
  professionalId: string;
  servicos: number; produtos: number; desconto: number; gorjeta: number;
  comissaoServico: number; comissaoProduto: number;
}

export interface AdiantamentoAberto { id: string; professionalId: string; valor: number; valorAbatido: number; data: string }

export interface Apuracao {
  professionalId: string;
  atendimentos: number;
  servicos: number; produtos: number; faturamento: number;
  comissaoServico: number; comissaoProduto: number; comissao: number;
  cotaSalao: number; gorjetas: number;
  adiantamentosAbertos: number; adiantamentos: number; aPagar: number;
}

export const cents = (v: unknown): number => Math.round(Number(v ?? 0) * 100);
export const reais = (c: number): number => c / 100;

export const saldoAdiantamento = (a: Pick<AdiantamentoAberto, 'valor' | 'valorAbatido'>): number =>
  Math.max(0, cents(a.valor) - cents(a.valorAbatido));

// Abate os adiantamentos (mais antigos primeiro) até zerar o bruto. O que sobra fica aberto.
export function consumirAdiantamentos(
  brutoCents: number,
  adiantamentos: AdiantamentoAberto[],
): { abatimentos: { id: string; valor: number }[]; total: number } {
  let resta = Math.max(0, brutoCents);
  const abatimentos: { id: string; valor: number }[] = [];
  const ordem = [...adiantamentos].sort((a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id));
  for (const a of ordem) {
    if (resta <= 0) break;
    const v = Math.min(resta, saldoAdiantamento(a));
    if (v <= 0) continue;
    abatimentos.push({ id: a.id, valor: v });
    resta -= v;
  }
  return { abatimentos, total: abatimentos.reduce((s, x) => s + x.valor, 0) };
}

export function apurar(comandas: ComandaApurada[], adiantamentos: AdiantamentoAberto[]): Apuracao[] {
  const por = new Map<string, Apuracao>();
  for (const k of comandas) {
    const a = por.get(k.professionalId) ?? {
      professionalId: k.professionalId, atendimentos: 0, servicos: 0, produtos: 0, faturamento: 0,
      comissaoServico: 0, comissaoProduto: 0, comissao: 0, cotaSalao: 0, gorjetas: 0,
      adiantamentosAbertos: 0, adiantamentos: 0, aPagar: 0,
    };
    a.atendimentos += 1;
    a.servicos += cents(k.servicos);
    a.produtos += cents(k.produtos);
    a.faturamento += cents(k.servicos) + cents(k.produtos) - cents(k.desconto);
    a.comissaoServico += cents(k.comissaoServico);
    a.comissaoProduto += cents(k.comissaoProduto);
    a.gorjetas += cents(k.gorjeta);
    por.set(k.professionalId, a);
  }
  return [...por.values()].map((a) => {
    const abertos = adiantamentos.filter((x) => x.professionalId === a.professionalId);
    const comissao = a.comissaoServico + a.comissaoProduto;
    const bruto = comissao + a.gorjetas;
    const { total } = consumirAdiantamentos(bruto, abertos);
    return {
      ...a,
      comissao,
      cotaSalao: a.faturamento - comissao,
      adiantamentosAbertos: abertos.reduce((s, x) => s + saldoAdiantamento(x), 0),
      adiantamentos: total,
      aPagar: bruto - total,
    };
  });
}

export interface Totais { faturamento: number; cotaSalao: number; cotaProfissionais: number; gorjetas: number; retencaoMedia: number | null }

export function totalizar(linhas: Pick<Apuracao, 'faturamento' | 'comissao' | 'gorjetas'>[]): Totais {
  const faturamento = linhas.reduce((s, l) => s + l.faturamento, 0);
  const cotaProfissionais = linhas.reduce((s, l) => s + l.comissao, 0);
  const cotaSalao = faturamento - cotaProfissionais;
  return {
    faturamento, cotaSalao, cotaProfissionais,
    gorjetas: linhas.reduce((s, l) => s + l.gorjetas, 0),
    retencaoMedia: faturamento > 0 ? Math.round((cotaSalao / faturamento) * 100) : null,
  };
}

export type StatusRepasse = 'pendente' | 'pago' | 'sem_valor';

export const statusRepasse = (aPagarCents: number, pago: boolean): StatusRepasse =>
  pago ? 'pago' : aPagarCents > 0 ? 'pendente' : 'sem_valor';

// Diferença entre o que a apuração dá hoje (bruto, antes dos adiantamentos) e a foto do pagamento.
export const diferencaDesdePagamento = (
  atual: Pick<Apuracao, 'comissao' | 'gorjetas'>,
  foto: { comissaoServico: unknown; comissaoProduto: unknown; gorjetas: unknown },
): number => atual.comissao + atual.gorjetas - (cents(foto.comissaoServico) + cents(foto.comissaoProduto) + cents(foto.gorjetas));
