import { z } from 'zod';
import type { ClienteBase } from './crm.repository.js';
import type { Fase, ResumoCliente } from './crmMetrics.js';

export interface ClienteInsight extends ClienteBase {
  fase: Fase; etiquetasAuto: string[]; ultimaVisita: ResumoCliente['ultimaVisita'];
  cicloMedio: number | null; retornoPrevisto: ResumoCliente['retornoPrevisto']; ltv: number; atendimentos: number;
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
