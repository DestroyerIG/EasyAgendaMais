import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AxiosAdapter, AxiosError } from 'axios';
import api from '@/lib/api';
import { contaApi } from '@/lib/conta';
import { getApiErrorMessage } from '@/utils/handleApiError';

function adaptadorErroBlob(status: number, corpo: unknown): AxiosAdapter {
  return (config) =>
    Promise.reject({
      isAxiosError: true,
      config,
      response: {
        status,
        data: new Blob([JSON.stringify(corpo)], { type: 'application/json' }),
        headers: {},
        config,
        statusText: '',
      },
    } as AxiosError);
}

describe('contaApi.baixarBackup com erro', () => {
  const original = api.defaults.adapter;
  afterEach(() => {
    api.defaults.adapter = original;
  });

  it('lê o JSON de dentro do Blob para mostrar a mensagem do servidor', async () => {
    api.defaults.adapter = adaptadorErroBlob(403, {
      success: false, error: { code: 'FORBIDDEN', message: 'Só a responsável pode baixar o backup.' },
    });
    const erro = await contaApi.baixarBackup().catch((e: unknown) => e);
    expect(getApiErrorMessage(erro, 'genérico')).toBe('Só a responsável pode baixar o backup.');
  });

  it('Blob que não é JSON cai no texto genérico', async () => {
    api.defaults.adapter = (config) =>
      Promise.reject({
        isAxiosError: true, config,
        response: { status: 500, data: new Blob(['<html>erro</html>']), headers: {}, config, statusText: '' },
      } as AxiosError);
    const erro = await contaApi.baixarBackup().catch((e: unknown) => e);
    expect(getApiErrorMessage(erro, 'genérico')).toBe('genérico');
  });
});
