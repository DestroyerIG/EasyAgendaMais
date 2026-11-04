import api from '@/lib/api';

// Depoimentos reais do EasyAgenda+ (avaliação do sistema pelo dono). Espelha backend/src/modules/depoimentos.

export type StatusDepoimentoAtual = 'em_analise' | 'publicado' | 'nao_publicado';

export interface DepoimentoAtual {
  status: StatusDepoimentoAtual;
  nota: number;
  texto: string;
  nomeExibido: string | null;
  cidade: string | null;
}

export interface MeuDepoimento {
  mostrarPopup: boolean;
  nomeSugerido: string;
  atual: DepoimentoAtual | null;
}

export interface EnviarDepoimentoBody {
  nota: number;
  texto: string;
  nomeExibido?: string;
  cidade?: string;
  autorizou: boolean;
}

export const depoimentosApi = {
  meu: async () => (await api.get<MeuDepoimento>('/depoimentos/meu')).data,
  enviar: async (body: EnviarDepoimentoBody) => { await api.post('/depoimentos', body); },
  adiar: async () => { await api.post('/depoimentos/adiar'); },
  dispensar: async () => { await api.post('/depoimentos/dispensar'); },
  retirar: async () => { await api.post('/depoimentos/retirar'); },
};
