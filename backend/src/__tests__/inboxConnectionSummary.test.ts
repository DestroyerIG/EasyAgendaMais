import { it, expect, vi, beforeEach } from 'vitest';
const repo = vi.hoisted(() => ({ enviosDesde: vi.fn(), historicoEnvios: vi.fn(), dadosConexao: vi.fn() }));
vi.mock('../modules/whatsappInbox/inbox.repository.js', () => ({ inboxRepository: repo }));
const wa = vi.hoisted(() => ({ whatsappService: { getStatus: vi.fn() } }));
vi.mock('../modules/whatsapp/whatsapp.service.js', () => wa);
vi.mock('../services/scheduleSettingsService.js', () => ({ getBusinessScheduleSettings: vi.fn(async () => ({ timezone: 'America/Sao_Paulo' })) }));
const { resumoConexao } = await import('../modules/whatsappInbox/connectionSummary.js');

beforeEach(() => {
  wa.whatsappService.getStatus.mockResolvedValue({ status: 'connected', connectedNumber: '5583981204000' });
  repo.dadosConexao.mockResolvedValue({ whatsapp: '5583981204000', whatsappConnectedAt: new Date('2026-10-04T12:00:00.000Z') });
  repo.enviosDesde.mockResolvedValue([
    { origin: 'lembrete', status: 'entregue', n: 40 }, { origin: 'confirmacao', status: 'lida', n: 2 },
    { origin: 'pix_recibo', status: 'enviada', n: 16 }, { origin: 'manual_painel', status: 'falhou', n: 2 },
    { origin: 'bot', status: 'enviada', n: 8 },
  ]);
  repo.historicoEnvios.mockResolvedValue([
    { id: 'm1', createdAt: new Date('2026-10-16T14:42:08.000Z'), origin: 'lembrete', status: 'lida', phoneKey: '8396112233', conversation: { phone: '5583996112233', client: { name: 'Juliana Mendes' } } },
    { id: 'm2', createdAt: new Date('2026-10-16T14:00:00.000Z'), origin: 'sistema', status: 'enviada', phoneKey: '8381204000', conversation: null },
  ]);
});

it('conta envios do dia do negócio por grupo e calcula saúde', async () => {
  const r = await resumoConexao('b1', new Date('2026-10-17T02:30:00.000Z')); // 23:30 de 16/10 em São Paulo
  expect(repo.enviosDesde).toHaveBeenCalledWith('b1', new Date('2026-10-16T03:00:00.000Z'));
  expect(r.enviosHoje).toEqual({ total: 68, falhas: 2, limite: 250, percentual: 27, disponiveis: 182, grupos: { automaticas: 42, pix: 16, manuais: 10 } });
  expect(r.saude).toBe('Boa');
  expect(r.diasConectado).toBe(12);
  expect(r.semInterrupcoes).toBe(true);
  expect(r.historico[0]).toEqual({ id: 'm1', criadaEm: '2026-10-16T14:42:08.000Z', cliente: 'Juliana Mendes', telefone: '+55 83 99611-****', tipo: 'Lembrete de agendamento', status: 'lida' });
  expect(r.historico[1]!.cliente).toBeNull();
});

it('desconectado e sem data de conexão', async () => {
  wa.whatsappService.getStatus.mockResolvedValue({ status: 'disconnected', connectedNumber: null });
  repo.dadosConexao.mockResolvedValue({ whatsapp: '5583981204000', whatsappConnectedAt: null });
  repo.enviosDesde.mockResolvedValue([]);
  const r = await resumoConexao('b1', new Date('2026-10-16T13:00:00.000Z'));
  expect(r).toMatchObject({ conectado: false, diasConectado: null, semInterrupcoes: false, saude: 'Excelente', numero: '5583981204000' });
  expect(r.enviosHoje.total).toBe(0);
});
