import api from '@/lib/api';
import type { Periodo } from '@/lib/relatorios';

// Avaliação da cliente pelo link do comprovante (fase 5).

export interface AvaliacaoPublica { negocio: string; profissional: string; cliente: string; servico: string; data: string }

export interface AvaliacaoRelatorio {
  id: string; nota: number; comentario: string | null; criadaEm: string; origem: 'link' | 'whatsapp' | string;
  cliente: string; servico: string; data: string;
}

export interface AvaliacoesPorProfissional {
  periodo: Periodo;
  media: number | null;
  quantidade: number;
  profissionais: { professional: { id: string; nome: string }; media: number; quantidade: number; itens: AvaliacaoRelatorio[] }[];
}

export const avaliacaoPublicaApi = {
  ver: async (token: string) => (await api.get<AvaliacaoPublica>(`/avaliacoes/${encodeURIComponent(token)}`)).data,
  enviar: async (token: string, nota: number, comentario: string | null) => {
    await api.post(`/avaliacoes/${encodeURIComponent(token)}`, { nota, comentario });
  },
};

export const avaliacoesRelatorioApi = {
  porProfissional: async (p: Periodo) => (await api.get<AvaliacoesPorProfissional>('/reports/avaliacoes', { params: p })).data,
};

export const formatarMedia = (m: number | null) => (m === null ? '—' : m.toFixed(1).replace('.', ','));

export const ROTULO_ORIGEM: Record<string, string> = { link: 'Link do comprovante', whatsapp: 'Resposta no WhatsApp' };
