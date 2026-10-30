import { z } from 'zod';
import { SEGMENTOS_VALIDOS } from '../../config/vocabulario.js';

const idSchema = z.object({
  id: z.string().uuid('ID inválido'),
});

const actionBodySchema = z.object({
  confirmation: z.literal('CONFIRM', { message: 'Envie confirmation=CONFIRM para confirmar esta ação' }),
  reason: z.string().trim().min(3, 'Informe o motivo da ação').max(255).optional(),
});

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const adminMetricsQuerySchema = z.object({
  periodDays: z.coerce.number().int().min(7).max(365).default(30),
});

// Filtros da gestão de negócios (H2). Status, busca e paginação rodam em memória sobre painelRepository.
export const adminTenantFiltrosSchema = z.object({
  busca: z.string().trim().max(120).optional(),
  segmento: z.enum(SEGMENTOS_VALIDOS as [string, ...string[]]).optional(),
  status: z.enum(['ativo', 'teste', 'carencia', 'bloqueado_cobranca', 'teste_encerrado', 'bloqueado_admin', 'cancelado']).optional(),
  plano: z.enum(['basico', 'profissional', 'premium']).optional(),
});

export const adminTenantListQuerySchema = adminTenantFiltrosSchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int()
    .refine((n) => [6, 20, 50, 100].includes(n), { message: 'Use 6, 20, 50 ou 100 por página' })
    .default(20),
});

export const adminSubscriptionListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
  status: z.enum(['active', 'trialing', 'pending', 'past_due', 'unpaid', 'canceled', 'incomplete']).optional(),
  plan: z.enum(['basico', 'profissional', 'premium']).optional(),
  overdueOnly: z.coerce.boolean().optional(),
  sortBy: z.enum(['updated_at', 'subscription_current_period_end', 'name']).default('updated_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const adminAuditLogQuerySchema = paginationQuerySchema.extend({
  action: z.string().trim().max(80).optional(),
  status: z.enum(['success', 'failed']).optional(),
  actor: z.string().trim().max(120).optional(),
  target: z.string().trim().max(120).optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
});

export const adminActionParamsSchema = idSchema;
export const adminActionBodySchema = actionBodySchema;

export const adminOverridePlanBodySchema = actionBodySchema.extend({
  plan: z.enum(['basico', 'profissional', 'premium']),
});

export const adminOverrideStatusBodySchema = actionBodySchema.extend({
  status: z.enum(['active', 'trialing', 'pending', 'past_due', 'unpaid', 'canceled', 'incomplete']),
});

export const adminCancelSubscriptionBodySchema = actionBodySchema;

export type AdminMetricsQuery = z.infer<typeof adminMetricsQuerySchema>;
export type AdminTenantFiltros = z.infer<typeof adminTenantFiltrosSchema>;
export type AdminTenantListQuery = z.infer<typeof adminTenantListQuerySchema>;
export type AdminSubscriptionListQuery = z.infer<typeof adminSubscriptionListQuerySchema>;
export type AdminAuditLogQuery = z.infer<typeof adminAuditLogQuerySchema>;
export type AdminActionParams = z.infer<typeof adminActionParamsSchema>;
export type AdminActionBody = z.infer<typeof adminActionBodySchema>;
export type AdminOverridePlanBody = z.infer<typeof adminOverridePlanBodySchema>;
export type AdminOverrideStatusBody = z.infer<typeof adminOverrideStatusBodySchema>;
