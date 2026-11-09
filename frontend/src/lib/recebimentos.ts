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

export const recebimentosApi = {
  conexoes: async () => (await api.get<EstadoRecebimentos>('/recebimentos/conexoes')).data,
  conectar: async () => (await api.get<{ url: string }>('/recebimentos/mercadopago/conectar')).data,
  confirmar: async (t: string) => (await api.post<EstadoRecebimentos>('/recebimentos/mercadopago/confirmar', { t })).data,
  definirFormas: async (formas: FormasRecebimento) =>
    (await api.put<EstadoRecebimentos>('/recebimentos/mercadopago/formas', formas)).data,
  conectarChave: async (d: { handle: string; chave: string; aceite: true }) =>
    (await api.post<EstadoRecebimentos>('/recebimentos/infinitepay/chave', d)).data,
  desconectar: async (gateway: GatewayId) => (await api.delete<{ desconectado: boolean }>(`/recebimentos/${gateway}/conexao`)).data,
};
