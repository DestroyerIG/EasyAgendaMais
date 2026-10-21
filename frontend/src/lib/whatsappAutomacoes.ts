import api from '@/lib/api';
import type { Origem, StatusMensagem } from '@/lib/whatsappInbox';

// Espelho de backend/src/modules/whatsappAutomacoes/automacoes.types.ts e metricas.service.ts.

export type Regra = 'confirmacao' | 'sinal_pix' | 'retorno' | 'lista_espera' | 'lembrete' | 'aniversario' | 'avaliacao';

/** Ordem de exibição (a do Stitch). */
export const REGRAS: Regra[] = ['confirmacao', 'sinal_pix', 'retorno', 'lista_espera', 'lembrete', 'aniversario', 'avaliacao'];

/** Presente padrão do aniversário (o mesmo de configPadrao em automacoes.rules.ts). */
export const PRESENTE_PADRAO = 'R$ 20 OFF em qualquer serviço';

export interface ConfigRegras {
  confirmacao: { hora: string };
  sinal_pix: { toleranciaMin: 15 | 30 | 60 };
  retorno: { modo: 'ciclo' | 'dias'; dias: number };
  lista_espera: { quantas: 1 | 3 | 5 };
  lembrete: { modo: '2h' | 'vespera'; hora: string };
  aniversario: { presente: string };
  avaliacao: { horas: 1 | 2 | 4; linkGoogle: string | null };
}

export type RegraDto<R extends Regra = Regra> = {
  [K in R]: {
    regra: K;
    ativa: boolean;
    texto: string;
    textoPadrao: string;
    personalizado: boolean;
    config: ConfigRegras[K];
    variaveis: string[];
  };
}[R];

export interface AtualizarRegra<R extends Regra = Regra> {
  ativa?: boolean;
  texto?: string | null;
  config?: Partial<ConfigRegras[R]>;
}

export interface PainelAutomacoesDto {
  receitaMes: number; receitaVariacaoPct: number | null;
  faltasEvitadas: number;
  taxaResposta: { pct: number | null; mediaMin: number | null; selo: 'Excelente' | 'Boa' | 'Baixa' | null };
  porRegra: {
    confirmacao: { faltasEvitadas: number };
    sinal_pix: { recebido: number };
    retorno: { recuperado: number };
    lista_espera: { vagasPreenchidas: number };
    lembrete: { enviados: number; lidosPct: number | null };
    aniversario: { aniversariantes: number; agendamentos: number };
    avaliacao: { notaMedia: number | null; novas: number };
  };
  conexao: { conectado: boolean; numero: string | null };
}

export interface HistoricoAutomacoesDto {
  itens: Array<{ id: string; criadaEm: string; cliente: string | null; telefone: string; tipo: Origem; status: StatusMensagem }>;
}

export const listarRegras = async () =>
  (await api.get<{ regras: RegraDto[] }>('/whatsapp/automacoes')).data.regras;

export const atualizarRegra = async <R extends Regra>(regra: R, patch: AtualizarRegra<R>) =>
  (await api.patch<RegraDto<R>>(`/whatsapp/automacoes/${regra}`, patch)).data;

export const testarRegra = async (regra: Regra) =>
  (await api.post<{ enviado: true; para: string }>(`/whatsapp/automacoes/${regra}/testar`)).data;

export const painel = async () =>
  (await api.get<PainelAutomacoesDto>('/whatsapp/automacoes/painel')).data;

export const historico = async (limite?: number) =>
  (await api.get<HistoricoAutomacoesDto>('/whatsapp/automacoes/historico', { params: limite ? { limite } : undefined })).data;
