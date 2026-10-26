import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { googleApi, GoogleTokenInvalido, GoogleIndisponivel, GoogleNaoEncontrado, eventoIdDe } from '../modules/googleAgenda/googleAgenda.api.js';

const resposta = (status: number, corpo: unknown = {}) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => corpo, text: async () => JSON.stringify(corpo) }) as Response;

describe('cliente da API do Google', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'cid';
    process.env.GOOGLE_CLIENT_SECRET = 'segredo';
    process.env.GOOGLE_AGENDA_REDIRECT_URI = 'https://api.exemplo.com/api/v1/google-agenda/callback';
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('urlConsentimento pede offline, consent e só os dois escopos', () => {
    const url = new URL(googleApi.urlConsentimento('estado-123'));
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toBe('estado-123');
    expect(url.searchParams.get('scope')!.split(' ').sort()).toEqual([
      'email', 'https://www.googleapis.com/auth/calendar.app.created',
      'https://www.googleapis.com/auth/calendar.freebusy', 'openid',
    ]);
  });

  it('accessToken com invalid_grant lança GoogleTokenInvalido', async () => {
    fetchMock.mockResolvedValue(resposta(400, { error: 'invalid_grant' }));
    await expect(googleApi.accessToken('r1')).rejects.toBeInstanceOf(GoogleTokenInvalido);
  });

  it('ocupado converte busy em datas', async () => {
    fetchMock.mockResolvedValue(resposta(200, {
      calendars: { primary: { busy: [{ start: '2026-11-10T13:00:00Z', end: '2026-11-10T14:00:00Z' }] } },
    }));
    const r = await googleApi.ocupado('tok', new Date('2026-11-10T00:00:00Z'), new Date('2026-11-11T00:00:00Z'));
    expect(r).toEqual([{ inicio: new Date('2026-11-10T13:00:00Z'), fim: new Date('2026-11-10T14:00:00Z') }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://www.googleapis.com/calendar/v3/freeBusy');
    expect(JSON.parse(init.body).items).toEqual([{ id: 'primary' }]);
  });

  it('apagarEvento ignora 404 e 410', async () => {
    fetchMock.mockResolvedValueOnce(resposta(404)).mockResolvedValueOnce(resposta(410));
    await expect(googleApi.apagarEvento('tok', 'cal', 'ev1')).resolves.toBeUndefined();
    await expect(googleApi.apagarEvento('tok', 'cal', 'ev1')).resolves.toBeUndefined();
  });

  it('429 lança GoogleIndisponivel', async () => {
    fetchMock.mockResolvedValue(resposta(429));
    await expect(googleApi.criarAgenda('tok', 'EasyAgenda+', 'America/Sao_Paulo')).rejects.toBeInstanceOf(GoogleIndisponivel);
  });

  const EV = { titulo: 't', descricao: 'd', inicio: '2026-11-10T10:00:00', fim: '2026-11-10T11:00:00', fuso: 'America/Sao_Paulo' };

  it('401 numa chamada da agenda lança GoogleTokenInvalido', async () => {
    fetchMock.mockResolvedValue(resposta(401));
    await expect(googleApi.gravarEvento('tok', 'cal', 'abc12345', EV)).rejects.toBeInstanceOf(GoogleTokenInvalido);
  });

  it('id do evento sai do agendamento, no alfabeto que o Google aceita', () => {
    expect(eventoIdDe('5F1C2A3B-0D4E-4F60-8A9B-0C1D2E3F4A5B')).toBe('5f1c2a3b0d4e4f608a9b0c1d2e3f4a5b');
  });

  it('gravarEvento cria com o id do agendamento e, se já existe (409), atualiza', async () => {
    fetchMock.mockResolvedValueOnce(resposta(409)).mockResolvedValueOnce(resposta(200, { id: 'abc12345' }));
    await expect(googleApi.gravarEvento('tok', 'cal', 'abc12345', EV)).resolves.toBe('abc12345');
    const [urlPost, post] = fetchMock.mock.calls[0];
    expect(post.method).toBe('POST');
    expect(urlPost).toMatch(/\/calendars\/cal\/events$/);
    expect(JSON.parse(post.body)).toMatchObject({ id: 'abc12345', status: 'confirmed' });
    const [urlPut, put] = fetchMock.mock.calls[1];
    expect(put.method).toBe('PUT');
    expect(urlPut).toMatch(/\/events\/abc12345$/);
  });

  it('404 na agenda lança GoogleNaoEncontrado', async () => {
    fetchMock.mockResolvedValue(resposta(404));
    await expect(googleApi.gravarEvento('tok', 'cal', 'abc12345', EV)).rejects.toBeInstanceOf(GoogleNaoEncontrado);
  });

  it('agendaExiste confere a agenda pelo id', async () => {
    fetchMock.mockResolvedValueOnce(resposta(200, { id: 'cal' })).mockResolvedValueOnce(resposta(404));
    await expect(googleApi.agendaExiste('tok', 'cal')).resolves.toBe(true);
    await expect(googleApi.agendaExiste('tok', 'cal')).resolves.toBe(false);
  });
});
