import api from '@/lib/api';

export type FormaCaixa = 'pix' | 'sinal_pix' | 'sinal_cartao' | 'debito' | 'credito' | 'dinheiro';

export interface CashDay {
  date: string; isToday: boolean; responsavel: string;
  session: null | {
    id: string; openedAt: string; openingBalance: number;
    closedAt: string | null; countedBalance: number | null; expectedBalance: number | null; difference: number | null;
  };
  totals: { entradas: number; entradasQtd: number; saidas: number; saidasQtd: number; saldo: number };
  comandasResumo: { total: number; fechadas: number; abertas: number; falta: number };
  formas: Array<{ chave: FormaCaixa; valor: number; quantidade: number }>;
  linhas: Array<{
    appointmentId: string | null; comandaId: string | null; numero: number | null; hora: string;
    cliente: string; telefone: string; profissional: string; servicos: string;
    pagamento: 'pix' | 'debito' | 'credito' | 'dinheiro' | 'sinal' | 'em_atendimento' | 'faltou';
    depositApplied: number; total: number; status: 'Fechada' | 'Aberta' | 'Falta' | 'Clube';
    /** A profissional mandou pelo app para a recepção cobrar (fase 5). */
    prontaParaCobrar?: boolean;
    /** O sinal desta reserva foi pago no cartão (cobrança automática). */
    sinalNoCartao?: boolean;
  }>;
  despesas: Array<{ id: string; descricao: string; categoria: string; valor: number; formaPagamento: string | null; criadoEm: string }>;
  movimentos: Array<{ id: string; kind: 'sangria' | 'suprimento'; valor: number; descricao: string; criadoEm: string }>;
  gaveta: { fundoInicial: number; entradasDinheiro: number; suprimentos: number; sangrias: number; saidasDinheiro: number; esperado: number };
}

// Rótulo e legenda de quantidade de cada forma, nos termos do caixa.html (baf21f).
export const ROTULO_FORMA_CAIXA: Record<FormaCaixa, { rotulo: string; legenda: (n: number) => string }> = {
  pix: { rotulo: 'Pix', legenda: (n) => `${n} no balcão` },
  sinal_pix: { rotulo: 'Sinais Pix', legenda: (n) => `${n} ${n === 1 ? 'antecipado' : 'antecipados'}` },
  sinal_cartao: { rotulo: 'Sinais cartão', legenda: (n) => `${n} ${n === 1 ? 'antecipado' : 'antecipados'}` },
  debito: { rotulo: 'Débito', legenda: (n) => `${n} ${n === 1 ? 'transação' : 'transações'}` },
  credito: { rotulo: 'Crédito', legenda: (n) => `${n} ${n === 1 ? 'transação' : 'transações'}` },
  dinheiro: { rotulo: 'Dinheiro', legenda: (n) => `${n} na gaveta` },
};

export const buscarCaixa = async (date?: string) => (await api.get<CashDay>('/cash/today', { params: date ? { date } : {} })).data;
export const abrirCaixa = async (openingBalance: number) => (await api.post<CashDay>('/cash/open', { openingBalance })).data;
export const registrarMovimento = async (m: { kind: 'sangria' | 'suprimento'; amount: number; description: string }) =>
  (await api.post<CashDay>('/cash/movements', m)).data;
export const reabrirCaixa = async () => (await api.post<CashDay>('/cash/reopen')).data;
export const fecharCaixa = async (d: { countedBalance: number; notes?: string; date?: string }) =>
  (await api.post<CashDay>('/cash/close', d)).data;
