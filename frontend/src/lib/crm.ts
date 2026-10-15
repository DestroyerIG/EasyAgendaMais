import api from '@/lib/api';
import type { CampoFicha, Segmento } from '@/lib/technicalSheetTemplates';

export type { CampoFicha, Segmento };
export type Fase = 'novo' | 'recorrente' | 'fiel' | 'em_risco' | 'perdido';
export const FASES: Fase[] = ['novo', 'recorrente', 'fiel', 'em_risco', 'perdido'];
export const FASE_ROTULO: Record<Fase, string> = {
  novo: 'Novo', recorrente: 'Recorrente', fiel: 'Fiel / VIP', em_risco: 'Em risco', perdido: 'Perdido',
};

export interface EtiquetaResumo { id: string; name: string; color: string }
export interface UltimaVisita { date: string; receita: number; servico: string; profissional: string; diasAtras: number }
export interface RetornoPrevisto { data: string | null; venceuHa: number | null; texto: string }

export interface ClienteInsight {
  id: string; name: string; phone: string; email: string | null; birthDate: string | null; createdAt: string; active: boolean;
  tags: EtiquetaResumo[];
  consentimento: 'consentido' | 'revogado' | 'nao_informado';
  fase: Fase; etiquetasAuto: string[]; ultimaVisita: UltimaVisita | null;
  cicloMedio: number | null; retornoPrevisto: RetornoPrevisto; ltv: number; atendimentos: number;
}

export interface InsightsQuery {
  page?: number; pageSize?: number; busca?: string; fase?: Fase; etiqueta?: string; profissional?: string;
  ordem?: 'ultima_visita' | 'nome' | 'ltv' | 'retorno';
}
export interface InsightsDto {
  itens: ClienteInsight[]; total: number;
  contagemPorFase: Record<Fase | 'todas', number>;
}

export interface FasesDto {
  colunas: Array<{ fase: Fase; rotulo: string; contagem: number; ltvTotal: number; cartoes: ClienteInsight[] }>;
  kpis: { ativas: number; ativasNovasNoMes: number; ltvMedio: number | null; retencao: number | null };
}

export interface CampoPersonalizado { label: string; value: string }
export interface FichaTecnicaDto {
  allergies: string | null; fields: Record<string, string>; customFields: CampoPersonalizado[];
  updatedAt: string | null; updatedBy: string | null; segmento: Segmento; campos: CampoFicha[];
}
export type FichaInput = Pick<FichaTecnicaDto, 'allergies' | 'fields' | 'customFields'>;

export interface ConsentimentoDto { estado: 'consentido' | 'revogado' | 'nao_informado'; desde: string | null; canal: 'painel' | 'publico' | 'whatsapp' | null }

export interface ClientProfileDto {
  cliente: { id: string; name: string; phone: string; email: string | null; birthDate: string | null; notes: string | null; createdAt: string };
  fase: Fase; etiquetas: EtiquetaResumo[]; etiquetasAuto: string[];
  indicadores: {
    cicloMedio: number | null; ticketMedio: number | null; visitasNoAno: number; faltasECancelamentos: number;
    ultimaVisita: UltimaVisita | null; retornoPrevisto: RetornoPrevisto;
  };
  consentimento: ConsentimentoDto;
  fichaTecnica: FichaTecnicaDto;
}

export type FiltroTimeline = 'todos' | 'agendamentos' | 'financeiro';
export interface TimelineEvento {
  tipo: 'agendado' | 'concluido' | 'faltou' | 'cancelado' | 'lembrete' | 'avaliacao' | 'sinal_pix' | 'cadastro';
  /** Instante UTC real (ISO). */
  data: string; titulo: string; descricao: string | null; valor: number | null; nota?: number;
}

export interface CrmSettings { segment: Segmento; dailyRevenueGoal: number | null }

export const buscarInsights = async (q: InsightsQuery = {}) =>
  (await api.get<InsightsDto>('/clients/insights', { params: q })).data;
export const buscarFases = async () => (await api.get<FasesDto>('/clients/phases')).data;

export async function exportarClientesCsv(): Promise<void> {
  const res = await api.get<Blob>('/clients/export.csv', { responseType: 'blob' });
  const cd = String(res.headers?.['content-disposition'] ?? '');
  const nome = /filename="?([^";]+)"?/i.exec(cd)?.[1] ?? 'clientes.csv';
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const buscarPerfil = async (id: string) => (await api.get<ClientProfileDto>(`/clients/${id}/profile`)).data;
export const buscarTimeline = async (id: string, filtro: FiltroTimeline = 'todos') =>
  (await api.get<TimelineEvento[]>(`/clients/${id}/timeline`, { params: { filtro } })).data;
export const salvarFichaTecnica = async (id: string, f: FichaInput) =>
  (await api.put<FichaTecnicaDto>(`/clients/${id}/technical-sheet`, f)).data;
export const registrarConsentimento = async (id: string, granted: boolean) =>
  (await api.post<ConsentimentoDto>(`/clients/${id}/consent`, { granted })).data;
export const buscarCrmSettings = async () => (await api.get<CrmSettings>('/business/crm-settings')).data;
export const salvarCrmSettings = async (s: CrmSettings) => (await api.put<CrmSettings>('/business/crm-settings', s)).data;
