import { vi, describe, it, beforeEach, expect } from 'vitest';
import { randomBytes } from 'node:crypto';

vi.mock('../config/prisma.js', () => ({ prisma: {} }));
vi.mock('../utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const repo = vi.hoisted(() => ({
  conexoesAtivas: vi.fn(), substituirOcupado: vi.fn(), ocupadosDoNegocio: vi.fn(), atualizarConexao: vi.fn(),
}));
vi.mock('../modules/googleAgenda/googleAgenda.repository.js', () => ({ googleAgendaRepository: repo }));
const api = vi.hoisted(() => ({ accessToken: vi.fn(), ocupado: vi.fn() }));
vi.mock('../modules/googleAgenda/googleAgenda.api.js', async (orig) => ({
  ...(await orig<typeof import('../modules/googleAgenda/googleAgenda.api.js')>()), googleApi: api,
}));
vi.mock('../services/scheduleSettingsService.js', () => ({
  getBusinessScheduleSettings: vi.fn(async () => ({ timezone: 'America/Sao_Paulo' })),
}));
vi.mock('../modules/notifications/notifications.service.js', () => ({ notificationsService: { notify: vi.fn() } }));
vi.mock('../modules/push/push.service.js', () => ({ pushService: { paraEquipe: vi.fn(), paraProfissional: vi.fn() } }));

process.env.GOOGLE_CLIENT_ID = 'cid';
process.env.GOOGLE_CLIENT_SECRET = 'segredo';
process.env.GOOGLE_AGENDA_REDIRECT_URI = 'https://api.test/cb';
process.env.GOOGLE_TOKEN_KEY = randomBytes(32).toString('base64');

const { faixasDoDia } = await import('../modules/googleAgenda/googleAgenda.rules.js');
const { googleAgendaService } = await import('../modules/googleAgenda/googleAgenda.service.js');
const { cifrar } = await import('../modules/googleAgenda/googleAgenda.crypto.js');
const { GoogleTokenInvalido } = await import('../modules/googleAgenda/googleAgenda.api.js');

const conexao = (over: Record<string, unknown> = {}) => ({
  id: 'c1', businessId: 'b1', tipo: 'profissional', professionalId: 'p1', status: 'ativa',
  refreshTokenCifrado: cifrar('r1'), business: { name: 'Studio', plan: 'profissional' }, ...over,
});
const ocupado = (inicio: string, fim: string, over: Record<string, unknown> = {}) => ({
  inicio: new Date(inicio), fim: new Date(fim),
  conexao: { tipo: 'profissional', status: 'ativa', professionalId: 'p1', business: { plan: 'profissional' }, ...over },
});

describe('Google Agenda: ocupado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.accessToken.mockResolvedValue('tok');
    api.ocupado.mockResolvedValue([{ inicio: new Date('2026-11-10T13:00:00Z'), fim: new Date('2026-11-10T14:00:00Z') }]);
    repo.conexoesAtivas.mockResolvedValue([conexao()]);
  });

  it('faixasDoDia recorta pelo dia no fuso', () => {
    // 22:00 de 10/11 às 02:00 de 11/11 em São Paulo (UTC-3)
    const noite = [{ inicio: new Date('2026-11-11T01:00:00Z'), fim: new Date('2026-11-11T05:00:00Z') }];
    expect(faixasDoDia(noite, '2026-11-10', 'America/Sao_Paulo')).toEqual([{ start: '22:00', end: '23:59' }]);
    expect(faixasDoDia(noite, '2026-11-11', 'America/Sao_Paulo')).toEqual([{ start: '00:00', end: '02:00' }]);
    const tarde = [{ inicio: new Date('2026-11-10T13:00:00Z'), fim: new Date('2026-11-10T14:00:00Z') }];
    expect(faixasDoDia(tarde, '2026-11-10', 'America/Sao_Paulo')).toEqual([{ start: '10:00', end: '11:00' }]);
    expect(faixasDoDia(tarde, '2026-11-09', 'America/Sao_Paulo')).toEqual([]);
  });

  it('faixasDoDia: dia inteiro vira 00:00 a 23:59', () => {
    const diaInteiro = [{ inicio: new Date('2026-11-10T03:00:00Z'), fim: new Date('2026-11-11T03:00:00Z') }];
    expect(faixasDoDia(diaInteiro, '2026-11-10', 'America/Sao_Paulo')).toEqual([{ start: '00:00', end: '23:59' }]);
    expect(faixasDoDia(diaInteiro, '2026-11-11', 'America/Sao_Paulo')).toEqual([]);
  });

  it('atualizarOcupado substitui o ocupado da conexão', async () => {
    await googleAgendaService.atualizarOcupado('c1');
    expect(repo.conexoesAtivas).toHaveBeenCalledWith({ id: 'c1' });
    const [, de, ate] = api.ocupado.mock.calls[0];
    expect(Math.round((ate.getTime() - de.getTime()) / 86_400_000)).toBe(60);
    expect(repo.substituirOcupado).toHaveBeenCalledWith('c1', [
      { inicio: new Date('2026-11-10T13:00:00Z'), fim: new Date('2026-11-10T14:00:00Z') },
    ]);
  });

  it('conexão sem professionalId não consulta o Google e limpa o ocupado', async () => {
    repo.conexoesAtivas.mockResolvedValue([conexao({ tipo: 'negocio', professionalId: null })]);
    await googleAgendaService.atualizarOcupado();
    expect(api.ocupado).not.toHaveBeenCalled();
    expect(repo.substituirOcupado).toHaveBeenCalledWith('c1', []);
  });

  it('token inválido marca reconectar e limpa o ocupado', async () => {
    const avisar = vi.spyOn(googleAgendaService, 'avisarReconectar').mockResolvedValue(undefined);
    api.accessToken.mockRejectedValue(new GoogleTokenInvalido());
    await googleAgendaService.atualizarOcupado();
    expect(repo.atualizarConexao).toHaveBeenCalledWith('c1', expect.objectContaining({ status: 'reconectar' }));
    expect(avisar).toHaveBeenCalledTimes(1);
  });

  it('bloqueiosDoDia ignora conexão em reconectar ou pausada_plano', async () => {
    repo.ocupadosDoNegocio.mockResolvedValue([
      ocupado('2026-11-10T13:00:00Z', '2026-11-10T14:00:00Z'),
      ocupado('2026-11-10T15:00:00Z', '2026-11-10T16:00:00Z', { status: 'reconectar' }),
      ocupado('2026-11-10T17:00:00Z', '2026-11-10T18:00:00Z', { business: { plan: 'basico' } }),
    ]);
    expect(await googleAgendaService.bloqueiosDoDia('b1', 'p1', '2026-11-10')).toEqual([{ start: '10:00', end: '11:00' }]);
  });

  it('ocupado da conexão de outro profissional não bloqueia', async () => {
    repo.ocupadosDoNegocio.mockResolvedValue([ocupado('2026-11-10T13:00:00Z', '2026-11-10T14:00:00Z', { professionalId: 'p2' })]);
    expect(await googleAgendaService.bloqueiosDoDia('b1', 'p1', '2026-11-10')).toEqual([]);
  });

  it('ocupadoDoDia agrupa por profissional', async () => {
    repo.ocupadosDoNegocio.mockResolvedValue([
      ocupado('2026-11-10T13:00:00Z', '2026-11-10T14:00:00Z'),
      ocupado('2026-11-10T18:00:00Z', '2026-11-10T19:00:00Z', { professionalId: 'p2', tipo: 'negocio' }),
    ]);
    expect(await googleAgendaService.ocupadoDoDia('b1', '2026-11-10')).toEqual({
      p1: [{ start: '10:00', end: '11:00' }], p2: [{ start: '15:00', end: '16:00' }],
    });
  });

  it('sem configuração não bloqueia nada', async () => {
    const chave = process.env.GOOGLE_TOKEN_KEY;
    delete process.env.GOOGLE_TOKEN_KEY;
    expect(await googleAgendaService.bloqueiosDoDia('b1', 'p1', '2026-11-10')).toEqual([]);
    expect(repo.ocupadosDoNegocio).not.toHaveBeenCalled();
    process.env.GOOGLE_TOKEN_KEY = chave;
  });
});
