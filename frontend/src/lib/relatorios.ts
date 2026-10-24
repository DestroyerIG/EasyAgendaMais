import api from '@/lib/api';

// Relatórios e comissões (sub-projeto 3).

export interface Periodo { inicio: string; fim: string }
export type ModeloRepasse = 'comissao' | 'salao_parceiro';
export type StatusRepasse = 'pendente' | 'pago' | 'sem_valor';
export type FormaRepasse = 'pix' | 'dinheiro' | 'transferencia';

export interface LinhaComissao {
  professional: { id: string; nome: string; foto: string | null; ativa: boolean; cnpj: string | null; especialidade: string | null };
  atendimentos: number;
  servicos: number; produtos: number; faturamento: number;
  comissaoServico: number; comissaoProduto: number; comissao: number;
  cotaSalao: number; gorjetas: number;
  adiantamentos: number; adiantamentosAbertos: number; aPagar: number;
  status: StatusRepasse;
  repasse: { id: string; pagoEm: string; forma: FormaRepasse; observacao: string | null; valorPago: number } | null;
  diferencaDesdePagamento: number;
}

export interface ApuracaoComissoes {
  periodo: Periodo;
  modelo: ModeloRepasse;
  modeloSalvo: ModeloRepasse;
  salaoParceiroLiberado: boolean;
  totais: { faturamento: number; cotaSalao: number; cotaProfissionais: number; gorjetas: number; retencaoMedia: number | null; aPagar: number };
  itens: LinhaComissao[];
}

export interface Adiantamento {
  id: string; professionalId: string; valor: number; valorAbatido: number; saldo: number; data: string; descricao: string | null;
}

export type Origem = 'publico' | 'whatsapp' | 'painel' | 'retorno_campanhas';

export interface VisaoGeral {
  periodo: Periodo;
  anterior: Periodo;
  indicadores: {
    ticketMedio: { valor: number | null; anterior: number | null; variacao: number | null };
    retornoNoCiclo: { valor: number | null; base: number; variacao: number | null };
    faltas: { valor: number | null; variacao: number | null; sinalPix: boolean; lembretes: boolean };
    faturamentoMes: { valor: number; meta: number | null; percentual: number | null };
  };
  faturamento: number;
  comandas: number;
  origem: { total: number; itens: { id: Origem; rotulo: string; quantidade: number; percentual: number; faturamento: number }[] };
  rodape: { produtosPercentual: number | null; projecaoMes: number; diasRestantes: number };
}

export type ChaveDia = 'seg' | 'ter' | 'qua' | 'qui' | 'sex' | 'sab' | 'dom';
export type Turno = 'manha' | 'tarde';
export interface CelulaOcupacao { dia: ChaveDia; turno: Turno; ocupacao: number | null }

export interface Ocupacao {
  periodo: Periodo;
  diasAbertos: Record<ChaveDia, boolean>;
  linhas: { professional: { id: string; nome: string; especialidade: string | null }; celulas: CelulaOcupacao[] }[];
  media: CelulaOcupacao[];
  insight: { texto: string; dia: ChaveDia; turno: Turno; ocupacao: number } | null;
  pico: { rotulo: string; ocupacao: number } | null;
}

export interface Evolucao {
  meses: { mes: string; servicos: number; produtos: number; total: number; meta: number | null; atual: boolean; projecao: number | null }[];
}

const params = (p?: Periodo) => (p ? { inicio: p.inicio, fim: p.fim } : undefined);

export const relatoriosApi = {
  visaoGeral: async (p?: Periodo) => (await api.get<VisaoGeral>('/reports/overview', { params: params(p) })).data,
  ocupacao: async (p?: Periodo) => (await api.get<Ocupacao>('/reports/occupancy', { params: params(p) })).data,
  evolucao: async () => (await api.get<Evolucao>('/reports/evolution')).data,
  comissoes: async (p?: Periodo) => (await api.get<ApuracaoComissoes>('/reports/commissions', { params: params(p) })).data,
  pagar: async (d: { professionalId: string; inicio: string; fim: string; forma: FormaRepasse; observacao?: string | null }) =>
    (await api.post<{ id: string }>('/reports/commissions/payouts', d)).data,
  desfazerPagamento: async (id: string) => (await api.delete<{ id: string }>(`/reports/commissions/payouts/${id}`)).data,
  adiantamentos: async (q: { professionalId?: string; abertos?: boolean } = {}) =>
    (await api.get<Adiantamento[]>('/reports/advances', { params: { professionalId: q.professionalId, abertos: q.abertos ? 'true' : undefined } })).data,
  lancarAdiantamento: async (d: { professionalId: string; valor: number; data?: string; descricao?: string | null }) =>
    (await api.post<Adiantamento>('/reports/advances', d)).data,
  excluirAdiantamento: async (id: string) => (await api.delete<{ id: string }>(`/reports/advances/${id}`)).data,
  salvarModelo: async (modelo: ModeloRepasse) =>
    (await api.put<{ modelo: ModeloRepasse }>('/reports/settings/payout-model', { modelo })).data,
  async exportarCsv(p: Periodo): Promise<void> {
    const res = await api.get<Blob>('/reports/commissions/export.csv', { params: params(p), responseType: 'blob' });
    const cd = String(res.headers?.['content-disposition'] ?? '');
    const nome = /filename="?([^";]+)"?/i.exec(cd)?.[1] ?? 'comissoes.csv';
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

// ─── Períodos (mesmas regras do backend, em dias de parede) ──────────────

const DIA = 24 * 60 * 60 * 1000;
const utc = (d: string) => Date.parse(`${d}T00:00:00Z`);
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const somarDias = (d: string, n: number) => ymd(utc(d) + n * DIA);
const ultimoDia = (d: string) => {
  const [y, m] = d.split('-').map(Number);
  return ymd(Date.UTC(y, m, 0));
};

export const hojeLocal = (agora: Date = new Date()) =>
  `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;

export const quinzenaDe = (d: string): Periodo =>
  Number(d.slice(8, 10)) <= 15
    ? { inicio: `${d.slice(0, 7)}-01`, fim: `${d.slice(0, 7)}-15` }
    : { inicio: `${d.slice(0, 7)}-16`, fim: ultimoDia(d) };

// Quinzena anterior (-1) ou seguinte (+1).
export const quinzenaVizinha = (p: Periodo, delta: -1 | 1): Periodo =>
  quinzenaDe(delta < 0 ? somarDias(p.inicio, -1) : somarDias(p.fim, 1));

export const mesDe = (d: string): Periodo => ({ inicio: `${d.slice(0, 7)}-01`, fim: ultimoDia(d) });
export const mesAnterior = (d: string): Periodo => mesDe(somarDias(`${d.slice(0, 7)}-01`, -1));
export const ultimos30 = (hoje: string): Periodo => ({ inicio: somarDias(hoje, -29), fim: hoje });

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const partes = (d: string) => ({ ano: Number(d.slice(0, 4)), mes: Number(d.slice(5, 7)) - 1, dia: Number(d.slice(8, 10)) });

// "1 a 15 de setembro de 2026" · "18 de agosto a 17 de setembro de 2026"
export function rotuloPeriodo(p: Periodo): string {
  const a = partes(p.inicio);
  const b = partes(p.fim);
  if (a.ano !== b.ano) return `${a.dia} de ${MESES[a.mes]} de ${a.ano} a ${b.dia} de ${MESES[b.mes]} de ${b.ano}`;
  if (a.mes !== b.mes) return `${a.dia} de ${MESES[a.mes]} a ${b.dia} de ${MESES[b.mes]} de ${b.ano}`;
  return `${a.dia} a ${b.dia} de ${MESES[b.mes]} de ${b.ano}`;
}

export const rotuloMes = (mes: string) => MESES_CURTOS[Number(mes.slice(5, 7)) - 1] ?? mes;
export const dataBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

export const formatarCnpj = (v: string | null): string | null => {
  const d = (v ?? '').replace(/\D/g, '');
  return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : v || null;
};

export const ROTULO_FORMA: Record<FormaRepasse, string> = { pix: 'Pix', dinheiro: 'Dinheiro', transferencia: 'Transferência' };

export const AVISO_SALAO_PARCEIRO =
  'Na parceria salão-parceiro, a cota-parte da profissional não entra na receita bruta do salão (Lei 13.352/2016). Confirme o enquadramento com seu contador.';
