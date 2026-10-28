import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AxiosAdapter, AxiosError } from 'axios';
import api from '@/lib/api';

const replace = vi.fn();

function adaptador402(details?: Record<string, unknown>): AxiosAdapter {
  return (config) =>
    Promise.reject({
      isAxiosError: true,
      config,
      response: {
        status: 402,
        data: { error: { code: 'SUBSCRIPTION_REQUIRED', message: 'Assinatura necessária', ...(details ? { details } : {}) } },
        headers: {},
        config,
        statusText: 'Payment Required',
      },
    } as AxiosError);
}

describe('402 SUBSCRIPTION_REQUIRED', () => {
  const original = api.defaults.adapter;
  beforeEach(() => {
    replace.mockReset();
    vi.stubGlobal('location', { pathname: '/dashboard/agendamentos', replace });
  });
  afterEach(() => {
    api.defaults.adapter = original;
    vi.unstubAllGlobals();
  });

  it('na carência não redireciona', async () => {
    api.defaults.adapter = adaptador402({ estado: 'carencia' });
    await expect(api.post('/clients', {})).rejects.toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('bloqueada vai para a assinatura', async () => {
    api.defaults.adapter = adaptador402({ estado: 'bloqueada' });
    await expect(api.post('/clients', {})).rejects.toBeTruthy();
    expect(replace).toHaveBeenCalledWith('/dashboard/assinatura');
  });

  it('sem estado vai para /pagamento', async () => {
    api.defaults.adapter = adaptador402();
    await expect(api.post('/clients', {})).rejects.toBeTruthy();
    expect(replace).toHaveBeenCalledWith('/pagamento');
  });

  it('já na página de assinatura não redireciona', async () => {
    vi.stubGlobal('location', { pathname: '/dashboard/assinatura', replace });
    api.defaults.adapter = adaptador402({ estado: 'bloqueada' });
    await expect(api.post('/clients', {})).rejects.toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('na bancada não redireciona: a profissional vê o aviso de agenda pausada', async () => {
    vi.stubGlobal('location', { pathname: '/bancada/clientes', replace });
    api.defaults.adapter = adaptador402({ estado: 'bloqueada' });
    await expect(api.get('/bancada/hoje')).rejects.toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });
});
