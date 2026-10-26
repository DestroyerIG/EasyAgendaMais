import api from '@/lib/api';

// Google Agenda (fase 7). Espelha backend/src/modules/googleAgenda.

export type ParaGoogle = 'negocio' | 'profissional';
export type StatusConexao = 'ativa' | 'reconectar' | 'pausada_plano';
export interface Faixa { start: string; end: string }

export interface ConexaoGoogle {
  tipo: ParaGoogle;
  googleEmail: string;
  status: StatusConexao;
  ultimaSyncEm: string | null;
  professionalId: string | null;
}

export interface EstadoGoogleAgenda {
  configurado: boolean;
  conexao: ConexaoGoogle | null;
  /** Só para a dona: a situação de cada profissional ativa. */
  profissionais?: Array<{ professionalId: string; nome: string; status: StatusConexao | null }>;
}

export const googleAgendaApi = {
  conexao: async () => (await api.get<EstadoGoogleAgenda>('/google-agenda/conexao')).data,
  conectar: async (para: ParaGoogle) =>
    (await api.get<{ url: string }>('/google-agenda/conectar', { params: { para } })).data,
  /** Confirma, com a sessão de quem está logado, a conexão que voltou do Google. */
  confirmar: async (t: string) => (await api.post<EstadoGoogleAgenda>('/google-agenda/confirmar', { t })).data,
  definirProfissional: async (professionalId: string | null) =>
    (await api.put<EstadoGoogleAgenda>('/google-agenda/conexao', { professionalId })).data,
  desconectar: async () => (await api.delete<{ desconectado: boolean }>('/google-agenda/conexao')).data,
  ocupado: async (data: string) =>
    (await api.get<Record<string, Faixa[]>>('/google-agenda/ocupado', { params: { data } })).data,
};

const minutos = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

/** O atendimento que começa em `hora` e dura `duracaoMin` cruza alguma faixa ocupada? */
export function cruzaOcupado(ocupado: Faixa[] | undefined, hora: string, duracaoMin: number): boolean {
  if (!ocupado?.length || !/^\d{2}:\d{2}/.test(hora)) return false;
  const ini = minutos(hora);
  const fim = ini + duracaoMin;
  return ocupado.some((f) => ini < minutos(f.end) && fim > minutos(f.start));
}
