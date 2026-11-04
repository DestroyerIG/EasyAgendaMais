import api from '@/lib/api';
import { abrirErroEmBlob } from '@/lib/conta';
import type {
  AbaDepoimentos,
  AdminActionPayload,
  AdminAuditLog,
  AdminCoupon,
  AdminCouponPayload,
  AdminVisaoGeral,
  CategoriaAuditoria,
  DepoimentoAdmin,
  ListaDepoimentosAdmin,
  CartoesGestao,
  DetalheNegocio,
  FiltrosAuditoria,
  FiltrosNegocios,
  LimitePagina,
  ListaNegocios,
  NegocioListado,
  PaginatedAdminResponse,
  PaginationMeta,
  RegistroAuditoria,
  TesteEstendido,
} from '@/types/admin';

type QueryParams = Record<string, string | number | boolean | undefined | null>;

type ApiResponseWithMeta<T> = {
  data: T;
  meta: PaginationMeta;
};

const extractWithMeta = <T>(response: unknown): ApiResponseWithMeta<T> => {
  const typed = response as { data: T; meta?: PaginationMeta };

  return {
    data: typed.data,
    meta: typed.meta || {
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 1,
    },
  };
};

const normalizeParams = (params: QueryParams) => {
  const next: Record<string, string | number | boolean> = {};

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '' && value !== false) {
      next[key] = value;
    }
  });

  return next;
};

// CSV: com responseType 'blob' o erro também chega como Blob; abre para a mensagem do servidor aparecer.
const baixarBlob = async (url: string, params: QueryParams = {}): Promise<Blob> => {
  try {
    const response = await api.get<Blob>(url, { params: normalizeParams(params), responseType: 'blob' });
    return response.data;
  } catch (error) {
    await abrirErroEmBlob(error);
    throw error;
  }
};

const actionPayload = (reason?: string): AdminActionPayload => ({
  confirmation: 'CONFIRM',
  ...(reason ? { reason } : {}),
});

export const adminApi = {
  async getMetrics(periodDays = 30): Promise<AdminVisaoGeral> {
    const response = await api.get('/admin/metrics', {
      params: normalizeParams({ periodDays }),
    });

    return response.data as AdminVisaoGeral;
  },

  async getTenants(
    filtros: FiltrosNegocios & { page?: number; limit?: LimitePagina } = {},
  ): Promise<ListaNegocios> {
    const response = await api.get('/admin/tenants', {
      params: normalizeParams({ ...filtros }),
    });

    const parsed = extractWithMeta<NegocioListado[]>(response as unknown as { data: NegocioListado[]; meta?: PaginationMeta });
    // Os cartões e a contagem por segmento vêm ao lado de data e meta no envelope.
    const envelope = (response as unknown as {
      envelope?: { cartoes?: CartoesGestao; segmentos?: ListaNegocios['segmentos'] };
    }).envelope;

    return {
      data: parsed.data,
      meta: parsed.meta,
      cartoes: envelope?.cartoes ?? null,
      segmentos: envelope?.segmentos ?? [],
    };
  },

  async exportTenantsCsv(filtros: FiltrosNegocios = {}): Promise<Blob> {
    return baixarBlob('/admin/tenants/export.csv', { ...filtros });
  },

  async getTenantDetails(tenantId: string): Promise<DetalheNegocio> {
    const response = await api.get(`/admin/tenants/${tenantId}`);
    return response.data as DetalheNegocio;
  },

  async getTenantAudit(
    tenantId: string,
    filtros: FiltrosAuditoria = {},
  ): Promise<PaginatedAdminResponse<RegistroAuditoria>> {
    const response = await api.get(`/admin/tenants/${tenantId}/auditoria`, {
      params: normalizeParams({ ...filtros }),
    });

    const parsed = extractWithMeta<RegistroAuditoria[]>(response as unknown as { data: RegistroAuditoria[]; meta?: PaginationMeta });
    return { data: parsed.data, meta: parsed.meta };
  },

  async exportTenantAuditCsv(tenantId: string, categoria: CategoriaAuditoria = 'todos'): Promise<Blob> {
    return baixarBlob(`/admin/tenants/${tenantId}/auditoria.csv`, { categoria });
  },

  async extendTrial(tenantId: string, dias: number, reason: string): Promise<TesteEstendido> {
    const response = await api.patch(`/admin/tenants/${tenantId}/trial`, { confirmation: 'CONFIRM', dias, reason });
    return response.data as TesteEstendido;
  },

  async blockTenant(tenantId: string, reason?: string) {
    const response = await api.patch(`/admin/tenants/${tenantId}/block`, actionPayload(reason));
    return response.data;
  },

  async unblockTenant(tenantId: string, reason?: string) {
    const response = await api.patch(`/admin/tenants/${tenantId}/unblock`, actionPayload(reason));
    return response.data;
  },

  async softDeleteTenant(tenantId: string, reason?: string) {
    const response = await api.delete(`/admin/tenants/${tenantId}`, {
      data: actionPayload(reason),
    });

    return response.data;
  },

  async blockUser(userId: string, reason?: string) {
    const response = await api.patch(`/admin/users/${userId}/block`, actionPayload(reason));
    return response.data;
  },

  async unblockUser(userId: string, reason?: string) {
    const response = await api.patch(`/admin/users/${userId}/unblock`, actionPayload(reason));
    return response.data;
  },

  async resyncSubscription(tenantId: string, reason?: string) {
    const response = await api.post(`/admin/subscriptions/${tenantId}/resync`, actionPayload(reason));
    return response.data;
  },

  /** Salão sob consulta: valor mensal combinado com o negócio. */
  async definirValorSalao(tenantId: string, valor: number, reason: string) {
    const response = await api.patch(`/admin/subscriptions/${tenantId}/valor-salao`, { ...actionPayload(reason), valor });
    return response.data as { tenantId: string; valorSalao: number };
  },

  async overrideSubscriptionPlan(tenantId: string, plan: string, reason?: string) {
    const response = await api.patch(`/admin/subscriptions/${tenantId}/plan`, {
      ...actionPayload(reason),
      plan,
    });
    return response.data;
  },

  async overrideSubscriptionStatus(tenantId: string, status: string, reason?: string) {
    const response = await api.patch(`/admin/subscriptions/${tenantId}/status`, {
      ...actionPayload(reason),
      status,
    });
    return response.data;
  },

  async cancelSubscriptionAdmin(tenantId: string, reason?: string) {
    const response = await api.post(`/admin/subscriptions/${tenantId}/cancel`, actionPayload(reason));
    return response.data;
  },

  async getAuditLogs(params: QueryParams = {}): Promise<PaginatedAdminResponse<AdminAuditLog>> {
    const response = await api.get('/admin/logs', {
      params: normalizeParams(params),
    });

    const parsed = extractWithMeta<AdminAuditLog[]>(response as unknown as { data: AdminAuditLog[]; meta?: PaginationMeta });
    return { data: parsed.data, meta: parsed.meta };
  },

  async getCoupons(): Promise<AdminCoupon[]> {
    const response = await api.get('/admin/coupons');
    const payload = response.data as { data?: AdminCoupon[] } | AdminCoupon[];
    return Array.isArray(payload) ? payload : payload.data || [];
  },

  async createCoupon(payload: AdminCouponPayload): Promise<AdminCoupon> {
    const response = await api.post('/admin/coupons', payload);
    return (response.data as { data: AdminCoupon }).data;
  },

  async updateCoupon(couponId: string, payload: AdminCouponPayload): Promise<AdminCoupon> {
    const response = await api.patch(`/admin/coupons/${couponId}`, payload);
    return (response.data as { data: AdminCoupon }).data;
  },

  async deleteCoupon(couponId: string) {
    const response = await api.delete(`/admin/coupons/${couponId}`);
    return response.data;
  },
  async listarDepoimentos(aba: AbaDepoimentos): Promise<ListaDepoimentosAdmin> {
    const response = await api.get('/admin/depoimentos', { params: { aba } });
    const body = response.data as { data?: DepoimentoAdmin[]; meta?: { publicados?: number } };
    return { data: body.data ?? [], publicados: body.meta?.publicados ?? 0 };
  },

  async publicarDepoimento(id: string): Promise<void> {
    await api.post(`/admin/depoimentos/${id}/publicar`);
  },

  async recusarDepoimento(id: string): Promise<void> {
    await api.post(`/admin/depoimentos/${id}/recusar`);
  },

  async corrigirDepoimento(id: string, texto: string): Promise<void> {
    await api.post(`/admin/depoimentos/${id}/corrigir`, { texto });
  },
};
