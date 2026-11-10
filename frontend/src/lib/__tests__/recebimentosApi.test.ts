import { describe, expect, it, vi, beforeEach } from 'vitest';
import api from '@/lib/api';
import { recebimentosApi } from '@/lib/recebimentos';

vi.mock('@/lib/api', () => ({ default: { get: vi.fn() } }));

describe('recebimentosApi.conectar', () => {
  beforeEach(() => vi.mocked(api.get).mockResolvedValue({ data: { url: 'https://mp' } }));

  it('envia origem=onboarding quando pedida', async () => {
    await recebimentosApi.conectar('onboarding');
    expect(api.get).toHaveBeenCalledWith('/recebimentos/mercadopago/conectar', { params: { origem: 'onboarding' } });
  });

  it('não envia params sem origem', async () => {
    await recebimentosApi.conectar();
    expect(api.get).toHaveBeenCalledWith('/recebimentos/mercadopago/conectar', undefined);
  });
});
