import { describe, it, expect } from 'vitest';
import { AxiosError } from 'axios';
import { getApiErrorMessage } from '../handleApiError';

const comResposta = (status: number, data: unknown) =>
  new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_RESPONSE', undefined, undefined, {
    status, data, statusText: '', headers: {}, config: {} as never,
  });

describe('getApiErrorMessage', () => {
  it('não vaza o texto em inglês do Axios quando o corpo não traz mensagem', () => {
    expect(getApiErrorMessage(comResposta(502, '<html>Bad Gateway</html>'))).toBe('Ocorreu um erro inesperado');
    expect(getApiErrorMessage(comResposta(500, undefined), 'Falha ao salvar')).toBe('Falha ao salvar');
  });
  it('usa a mensagem do corpo quando existe', () => {
    expect(getApiErrorMessage(comResposta(400, { error: 'Dados inválidos' }))).toBe('Dados inválidos');
  });
  it('sem resposta mostra erro de conexão em pt-BR', () => {
    expect(getApiErrorMessage(new AxiosError('Network Error'))).toBe('Erro de conexão. Verifique sua internet.');
  });
});

describe('getApiErrorMessage com details que não são texto', () => {
  it('ignora objetos em error.details e usa a mensagem', () => {
    const e = comResposta(400, { error: { code: 'VALIDATION_ERROR', message: 'Nenhuma cliente neste público', details: [{ campanhaId: 'abc' }] } });
    expect(getApiErrorMessage(e)).toBe('Nenhuma cliente neste público');
  });
});
