import { vi, describe, it, beforeEach, expect } from 'vitest';
import { randomBytes } from 'node:crypto';

vi.mock('../config/prisma.js', () => ({ prisma: {} }));
vi.mock('../utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const repo = vi.hoisted(() => ({
  conexoesAtivas: vi.fn(), agendamentoPorId: vi.fn(), agendamentosDaJanela: vi.fn(), eventosDaConexao: vi.fn(),
  salvarEvento: vi.fn(), apagarEvento: vi.fn(), atualizarConexao: vi.fn(),
}));
vi.mock('../modules/googleAgenda/googleAgenda.repository.js', () => ({ googleAgendaRepository: repo }));
const api = vi.hoisted(() => ({ accessToken: vi.fn(), salvarEvento: vi.fn(), apagarEvento: vi.fn() }));
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
process.env.FRONTEND_URL = 'https://app.test';

const { montarEvento, conexoesQueVeem } = await import('../modules/googleAgenda/googleAgenda.rules.js');
const { googleAgendaService } = await import('../modules/googleAgenda/googleAgenda.service.js');
const { cifrar } = await import('../modules/googleAgenda/googleAgenda.crypto.js');
const { GoogleTokenInvalido, GoogleIndisponivel } = await import('../modules/googleAgenda/googleAgenda.api.js');

const V1 = new Date('2026-11-01T10:00:00Z');
const V2 = new Date('2026-11-02T10:00:00Z');
const ag = (over: Record<string, unknown> = {}) => ({
  id: 'a1', businessId: 'b1', professionalId: 'p1', status: 'confirmado', updatedAt: V1,
  date: new Date('2026-11-10T00:00:00Z'), time: new Date('1970-01-01T14:00:00Z'),
  client: { name: 'Mariana Lima', phone: '11999990000' }, service: { name: 'Design de Sobrancelha', durationMinutes: 45 },
  professional: { name: 'Camila' }, ...over,
});
const conexao = (over: Record<string, unknown> = {}) => ({
  id: 'cn', businessId: 'b1', tipo: 'negocio', professionalId: null, status: 'ativa', calendarioId: 'cal-n',
  refreshTokenCifrado: cifrar('r1'), business: { name: 'Studio Aurora', plan: 'profissional' }, ...over,
});

describe('Google Agenda: saída', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.accessToken.mockResolvedValue('tok');
    api.salvarEvento.mockResolvedValue('ev-novo');
    repo.eventosDaConexao.mockResolvedValue([]);
    repo.agendamentosDaJanela.mockResolvedValue([ag()]);
    repo.conexoesAtivas.mockResolvedValue([conexao()]);
  });

  it('montarEvento usa primeiro nome, serviço e profissional só na agenda do negócio', () => {
    const ctx = { fuso: 'America/Sao_Paulo', frontendUrl: 'https://app.test' };
    const n = montarEvento(ag(), 'negocio', ctx);
    expect(n).toMatchObject({
      titulo: 'Mariana · Design de Sobrancelha · Camila',
      inicio: '2026-11-10T14:00:00', fim: '2026-11-10T14:45:00', fuso: 'America/Sao_Paulo',
    });
    expect(n.descricao).toContain('https://app.test/agendamentos?id=a1');
    expect(n.descricao).not.toContain('11999990000');
    expect(montarEvento(ag(), 'profissional', ctx).titulo).toBe('Mariana · Design de Sobrancelha');
  });

  it('montarEvento atravessa a meia-noite', () => {
    const e = montarEvento(ag({ time: new Date('1970-01-01T23:30:00Z'), service: { name: 'X', durationMinutes: 60 } }), 'profissional', { fuso: 'America/Sao_Paulo', frontendUrl: '' });
    expect(e.fim).toBe('2026-11-11T00:30:00');
  });

  it('conexoesQueVeem: a do negócio vê todos, a da profissional só os dela, e só as ativas', () => {
    const cs = [conexao(), conexao({ id: 'c1', tipo: 'profissional', professionalId: 'p1' }),
      conexao({ id: 'c2', tipo: 'profissional', professionalId: 'p2' }),
      conexao({ id: 'c3', tipo: 'profissional', professionalId: 'p1', business: { plan: 'basico' } })];
    expect(conexoesQueVeem(ag(), cs).map((c) => c.id)).toEqual(['cn', 'c1']);
  });

  it('cria evento para agendamento sem evento e grava a versao', async () => {
    await googleAgendaService.sincronizarSaida();
    expect(api.salvarEvento).toHaveBeenCalledWith('tok', 'cal-n', expect.objectContaining({ titulo: 'Mariana · Design de Sobrancelha · Camila' }), undefined);
    expect(repo.salvarEvento).toHaveBeenCalledWith({ conexaoId: 'cn', appointmentId: 'a1', googleEventId: 'ev-novo', versao: V1 });
    expect(repo.atualizarConexao).toHaveBeenCalledWith('cn', expect.objectContaining({ ultimaSyncEm: expect.any(Date) }));
  });

  it('não regrava quando a versao não mudou', async () => {
    repo.eventosDaConexao.mockResolvedValue([{ appointmentId: 'a1', googleEventId: 'ev1', versao: V1 }]);
    await googleAgendaService.sincronizarSaida();
    expect(api.accessToken).not.toHaveBeenCalled();
    expect(api.salvarEvento).not.toHaveBeenCalled();
  });

  it('atualiza quando updated_at mudou', async () => {
    repo.eventosDaConexao.mockResolvedValue([{ appointmentId: 'a1', googleEventId: 'ev1', versao: V1 }]);
    repo.agendamentosDaJanela.mockResolvedValue([ag({ updatedAt: V2 })]);
    api.salvarEvento.mockResolvedValue('ev1');
    await googleAgendaService.sincronizarSaida();
    expect(api.salvarEvento).toHaveBeenCalledWith('tok', 'cal-n', expect.anything(), 'ev1');
    expect(repo.salvarEvento).toHaveBeenCalledWith(expect.objectContaining({ versao: V2 }));
  });

  it('cancelado apaga o evento e o registro', async () => {
    repo.eventosDaConexao.mockResolvedValue([{ appointmentId: 'a1', googleEventId: 'ev1', versao: V1 }]);
    repo.agendamentosDaJanela.mockResolvedValue([ag({ status: 'cancelado', updatedAt: V2 })]);
    await googleAgendaService.sincronizarSaida();
    expect(api.apagarEvento).toHaveBeenCalledWith('tok', 'cal-n', 'ev1');
    expect(repo.apagarEvento).toHaveBeenCalledWith('cn', 'a1');
    expect(api.salvarEvento).not.toHaveBeenCalled();
  });

  it('troca de profissional move o evento', async () => {
    const antiga = conexao({ id: 'c1', tipo: 'profissional', professionalId: 'p1', calendarioId: 'cal-1' });
    const nova = conexao({ id: 'c2', tipo: 'profissional', professionalId: 'p2', calendarioId: 'cal-2' });
    repo.conexoesAtivas.mockResolvedValue([antiga, nova]);
    repo.agendamentosDaJanela.mockResolvedValue([ag({ professionalId: 'p2', professional: { name: 'Bia' }, updatedAt: V2 })]);
    repo.eventosDaConexao.mockImplementation(async (id: string) => (id === 'c1' ? [{ appointmentId: 'a1', googleEventId: 'ev1', versao: V1 }] : []));

    await googleAgendaService.sincronizarSaida();

    expect(api.apagarEvento).toHaveBeenCalledWith('tok', 'cal-1', 'ev1');
    expect(repo.apagarEvento).toHaveBeenCalledWith('c1', 'a1');
    expect(api.salvarEvento).toHaveBeenCalledWith('tok', 'cal-2', expect.anything(), undefined);
  });

  it('busca só a janela de ontem a +90 dias', async () => {
    await googleAgendaService.sincronizarSaida();
    const [, janela] = repo.agendamentosDaJanela.mock.calls[0];
    const dias = (d: Date) => Math.round((d.getTime() - Date.now()) / 86_400_000);
    expect(dias(janela.de)).toBe(-1);
    expect(dias(janela.ate)).toBe(90);
  });

  it('sincronização de um agendamento olha só o negócio dele', async () => {
    repo.agendamentoPorId.mockResolvedValue({ id: 'a1', businessId: 'b1' });
    await googleAgendaService.sincronizarSaida({ appointmentId: 'a1' });
    expect(repo.conexoesAtivas).toHaveBeenCalledWith({ businessId: 'b1' });
    expect(repo.agendamentosDaJanela.mock.calls[0][1]).toMatchObject({ appointmentId: 'a1' });
  });

  it('token inválido marca reconectar e avisa uma vez', async () => {
    const avisar = vi.spyOn(googleAgendaService, 'avisarReconectar').mockResolvedValue(undefined);
    api.accessToken.mockRejectedValue(new GoogleTokenInvalido());
    await googleAgendaService.sincronizarSaida();
    expect(repo.atualizarConexao).toHaveBeenCalledWith('cn', expect.objectContaining({ status: 'reconectar' }));
    expect(avisar).toHaveBeenCalledTimes(1);

    // Na rodada seguinte ela já não vem como ativa: ninguém é avisado de novo.
    repo.conexoesAtivas.mockResolvedValue([]);
    await googleAgendaService.sincronizarSaida();
    expect(avisar).toHaveBeenCalledTimes(1);
  });

  it('GoogleIndisponivel não muda status', async () => {
    api.salvarEvento.mockRejectedValue(new GoogleIndisponivel());
    await expect(googleAgendaService.sincronizarSaida()).resolves.toBeUndefined();
    expect(repo.atualizarConexao).not.toHaveBeenCalledWith('cn', expect.objectContaining({ status: 'reconectar' }));
  });
});
