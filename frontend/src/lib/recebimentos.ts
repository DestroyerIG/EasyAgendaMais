import api from '@/lib/api';

// Recebimentos automáticos. Espelha backend/src/modules/recebimentos (EstadoRecebimentos).

export type GatewayId = 'mercadopago' | 'infinitepay';

export interface ConexaoRecebimento {
  gateway: GatewayId;
  situacao: 'ativa' | 'precisa_reconectar';
  contaNome: string;
  aceitaPix: boolean;
  aceitaCartao: boolean;
  aceiteCartaoEm: string | null;
  ultimaConfirmacaoEm: string | null;
  reservasPendentes: number;
}

export interface EstadoRecebimentos {
  configurado: boolean;
  disponiveis: GatewayId[];
  conexao: ConexaoRecebimento | null;
}

export interface FormasRecebimento { aceitaPix: boolean; aceitaCartao: boolean; aceiteCartao?: boolean }

/** Maquininha Point da conta do Mercado Pago (`modo` PDV = recebe cobranças do sistema). */
export interface Maquininha { id: string; nome: string; modo: 'PDV' | 'STANDALONE' | 'UNDEFINED' }
export interface EstadoMaquininhas { padrao: string | null; terminais: Maquininha[] }

export const recebimentosApi = {
  conexoes: async () => (await api.get<EstadoRecebimentos>('/recebimentos/conexoes')).data,
  conectar: async (origem?: 'onboarding') =>
    (await api.get<{ url: string }>('/recebimentos/mercadopago/conectar', origem ? { params: { origem } } : undefined)).data,
  confirmar: async (t: string) => (await api.post<EstadoRecebimentos>('/recebimentos/mercadopago/confirmar', { t })).data,
  definirFormas: async (formas: FormasRecebimento) =>
    (await api.put<EstadoRecebimentos>('/recebimentos/mercadopago/formas', formas)).data,
  conectarChave: async (d: { handle: string; chave: string; aceite: true }) =>
    (await api.post<EstadoRecebimentos>('/recebimentos/infinitepay/chave', d)).data,
  maquininhas: async () => (await api.get<EstadoMaquininhas>('/recebimentos/maquininhas')).data,
  ativarPdv: async (id: string) =>
    (await api.post<EstadoMaquininhas>(`/recebimentos/maquininhas/${encodeURIComponent(id)}/pdv`)).data,
  definirTerminalPadrao: async (terminalId: string | null) =>
    (await api.put<EstadoMaquininhas>('/recebimentos/maquininhas/padrao', { terminalId })).data,
  desconectar: async (gateway: GatewayId) => (await api.delete<{ desconectado: boolean }>(`/recebimentos/${gateway}/conexao`)).data,
};
