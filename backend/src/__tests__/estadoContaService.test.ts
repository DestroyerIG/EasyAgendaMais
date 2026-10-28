import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockGetCtx = vi.hoisted(() => vi.fn());

vi.mock('../repositories/subscriptionRepository.js', () => ({
  subscriptionRepository: { getBusinessBillingContext: mockGetCtx },
}));

import { estadoDoContexto, estadoContaService } from '../modules/conta/estadoConta.service.js';
import type { BusinessBillingContext } from '../types/domain.js';

const DIA = 86_400_000;
const agora = new Date('2026-10-28T12:00:00Z');

const ctx = (extra: Record<string, unknown> = {}): BusinessBillingContext => ({
  business_id: 'b1',
  subscription_status: 'past_due',
  payment_method: null,
  provider_subscription_id: null,
  provider_payment_id: null,
  stripe_subscription_id: null,
  last_payment_date: null,
  ja_pagou: true,
  inadimplente_desde: new Date(agora.getTime() - 2 * DIA),
  ...extra,
});

describe('estadoDoContexto', () => {
  it('past_due, já pagou, inadimplente há 2 dias -> carencia', () => {
    expect(estadoDoContexto(ctx(), agora).tipo).toBe('carencia');
  });

  it('ctx null -> bloqueada / teste', () => {
    expect(estadoDoContexto(null, agora)).toEqual({ tipo: 'bloqueada', motivo: 'teste' });
  });

  it('normaliza o status (PAST_DUE com espaços)', () => {
    expect(estadoDoContexto(ctx({ subscription_status: ' PAST_DUE ' }), agora).tipo).toBe('carencia');
  });

  it('aceita datas como string', () => {
    const e = estadoDoContexto(ctx({ inadimplente_desde: new Date(agora.getTime() - 9 * DIA).toISOString() }), agora);
    expect(e).toEqual({ tipo: 'bloqueada', motivo: 'cobranca' });
  });

  it('fimDoPeriodo vem de current_period_end e cai em subscription_current_period_end', () => {
    const futuro = new Date(agora.getTime() + 3 * DIA);
    expect(estadoDoContexto(ctx({ subscription_status: 'pending', current_period_end: futuro }), agora).tipo).toBe('ativa');
    expect(
      estadoDoContexto(ctx({ subscription_status: 'pending', current_period_end: null, subscription_current_period_end: futuro }), agora).tipo,
    ).toBe('ativa');
  });

  it('sem ja_pagou -> bloqueada / teste', () => {
    expect(estadoDoContexto(ctx({ ja_pagou: false }), agora)).toEqual({ tipo: 'bloqueada', motivo: 'teste' });
  });
});

describe('estadoContaService.doNegocio', () => {
  beforeEach(() => {
    mockGetCtx.mockReset();
    mockGetCtx.mockResolvedValue(ctx());
    estadoContaService.limparCache();
  });

  it('cacheia por 60 s e consulta de novo depois', async () => {
    await estadoContaService.doNegocio('b1', agora);
    await estadoContaService.doNegocio('b1', new Date(agora.getTime() + 30_000));
    expect(mockGetCtx).toHaveBeenCalledTimes(1);
    await estadoContaService.doNegocio('b1', new Date(agora.getTime() + 61_000));
    expect(mockGetCtx).toHaveBeenCalledTimes(2);
  });

  it('negócios diferentes não compartilham cache', async () => {
    await estadoContaService.doNegocio('b1', agora);
    await estadoContaService.doNegocio('b2', agora);
    expect(mockGetCtx).toHaveBeenCalledTimes(2);
  });
});
