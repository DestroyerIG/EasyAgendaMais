import { subscriptionRepository } from '../../repositories/subscriptionRepository.js';
import { normalizeInternalSubscriptionStatus } from '../../services/billing/statusMapper.js';
import type { BusinessBillingContext } from '../../types/domain.js';
import { calcularEstadoConta, type EstadoConta } from './estadoConta.rules.js';

const CACHE_MS = 60_000;

const paraData = (valor: unknown): Date | null => {
  if (valor === null || valor === undefined || valor === '') return null;
  const data = new Date(valor as string | number | Date);
  return Number.isNaN(data.getTime()) ? null : data;
};

export function estadoDoContexto(ctx: BusinessBillingContext | null, agora: Date = new Date()): EstadoConta {
  if (!ctx) return { tipo: 'bloqueada', motivo: 'teste' };

  return calcularEstadoConta({
    status: normalizeInternalSubscriptionStatus(ctx.subscription_status),
    inadimplenteDesde: paraData(ctx.inadimplente_desde),
    jaPagou: ctx.ja_pagou === true,
    fimDoPeriodo: paraData(ctx.current_period_end ?? ctx.subscription_current_period_end),
    agora,
  });
}

const cache = new Map<string, { em: number; estado: EstadoConta }>();

export const estadoContaService = {
  async doNegocio(businessId: string, agora: Date = new Date()): Promise<EstadoConta> {
    const hit = cache.get(businessId);
    if (hit && agora.getTime() - hit.em < CACHE_MS) return hit.estado;

    const ctx = (await subscriptionRepository.getBusinessBillingContext(businessId)) as BusinessBillingContext | null;
    const estado = estadoDoContexto(ctx, agora);
    cache.set(businessId, { em: agora.getTime(), estado });
    return estado;
  },

  limparCache(): void {
    cache.clear();
  },
};
