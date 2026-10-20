import { z } from 'zod';
import type { ClienteBase } from './crm.repository.js';
import type { Fase, ResumoCliente } from './crmMetrics.js';
import type { Segmento, CampoFicha } from './technicalSheetTemplates.js';

export interface ClienteInsight extends ClienteBase {
  fase: Fase; etiquetasAuto: string[]; ultimaVisita: ResumoCliente['ultimaVisita'];
  cicloMedio: number | null; retornoPrevisto: ResumoCliente['retornoPrevisto']; ltv: number; atendimentos: number;
  avatarUrl: string | null;
}

export const InsightsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  busca: z.string().trim().optional(),
  fase: z.enum(['novo', 'recorrente', 'fiel', 'em_risco', 'perdido']).optional(),
  etiqueta: z.string().uuid().optional(),
  profissional: z.string().uuid().optional(),
  ordem: z.enum(['ultima_visita', 'nome', 'ltv', 'retorno']).default('ultima_visita'),
});
export type InsightsQuery = z.infer<typeof InsightsQuerySchema>;

export const FichaInputSchema = z.object({
  allergies: z.string().max(1000).nullable(),
  fields: z.record(z.string(), z.string().max(200)),
  customFields: z.array(z.object({ label: z.string().trim().min(1).max(40), value: z.string().max(200) })).max(20),
});
export type FichaInput = z.infer<typeof FichaInputSchema>;
export const ConsentInputSchema = z.object({ granted: z.boolean() });
export const TimelineQuerySchema = z.object({ filtro: z.enum(['todos', 'agendamentos', 'financeiro']).default('todos') });
export const CrmSettingsSchema = z.object({
  segment: z.enum(['unhas', 'cilios_sobrancelhas', 'cabelo', 'barbearia', 'estetica', 'outro']),
  dailyRevenueGoal: z.number().positive().max(99999999.99).multipleOf(0.01).nullable(),
});
export type CrmSettings = z.infer<typeof CrmSettingsSchema>;

export interface FichaTecnicaDto {
  allergies: string | null; fields: Record<string, string>; customFields: Array<{ label: string; value: string }>;
  updatedAt: string | null; updatedBy: string | null; segmento: Segmento; campos: CampoFicha[];
}
export interface ConsentimentoDto { estado: 'consentido' | 'revogado' | 'nao_informado'; desde: string | null; canal: 'painel' | 'publico' | 'whatsapp' | null }
export interface ClientProfileDto {
  cliente: {
    id: string; name: string; phone: string; email: string | null; birthDate: string | null; notes: string | null; createdAt: string;
    avatarUrl: string | null;
  };
  fase: Fase; etiquetas: Array<{ id: string; name: string; color: string }>; etiquetasAuto: string[];
  indicadores: {
    cicloMedio: number | null; ticketMedio: number | null; visitasNoAno: number; faltasECancelamentos: number;
    ultimaVisita: ResumoCliente['ultimaVisita']; retornoPrevisto: ResumoCliente['retornoPrevisto'];
  };
  consentimento: ConsentimentoDto;
  fichaTecnica: FichaTecnicaDto;
}
export interface TimelineEvento {
  tipo: 'agendado' | 'concluido' | 'faltou' | 'cancelado' | 'lembrete' | 'avaliacao' | 'sinal_pix' | 'cadastro';
  data: string; titulo: string; descricao: string | null; valor: number | null; nota?: number;
}
