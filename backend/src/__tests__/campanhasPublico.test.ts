import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const crm = vi.hoisted(() => ({ clientes: vi.fn(), visitas: vi.fn() }));
const inbox = vi.hoisted(() => ({ telefonesEmOptOut: vi.fn() }));
const neg = vi.hoisted(() => ({ negocio: vi.fn() }));
const agenda = vi.hoisted(() => ({ carregarAgendaSemana: vi.fn(), vagasDaSemana: vi.fn() }));
vi.mock('../config/prisma.js', () => ({ prisma: {} }));
vi.mock('../modules/crm/crm.repository.js', () => ({ crmRepository: crm }));
vi.mock('../modules/whatsappInbox/inbox.recorder.js', () => ({ inboxRecorder: inbox }));
vi.mock('../modules/whatsappRetorno/retorno.repository.js', () => ({ retornoRepository: neg }));
vi.mock('../modules/dashboard/today.service.js', () => agenda);
vi.mock('../services/scheduleSettingsService.js', () => ({ getBusinessScheduleSettings: vi.fn(async () => ({ timezone: 'America/Sao_Paulo' })) }));

const { publicoService } = await import('../modules/whatsappCampanhas/publico.service.js');
const { RODAPE_SAIR } = await import('../modules/whatsappCampanhas/campanhas.types.js');

const AGORA = new Date('2026-10-20T13:00:00Z');
const dias = (n: number) => new Date(AGORA.getTime() - n * 86_400_000).toISOString().slice(0, 10);
const cli = (id: string, name: string, phone: string, over: Record<string, unknown> = {}) =>
  ({ id, name, phone, active: true, birthDate: null, consentimento: 'consentido', ...over });
const visita = (atras: number) => [{ date: dias(atras), receita: 100, servico: 'Gel', profissional: 'Camila Souza', professionalId: 'p1', serviceId: 's1', duracao: 60 }];

const INPUT = { segmento: 'em_risco' as const, professionalId: null, serviceId: null, texto: '' };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.FRONTEND_URL = 'https://app.test';
  crm.clientes.mockResolvedValue([
    cli('c1', 'Ana Paula', '83999990001'),
    cli('c2', 'Bia Lima', '83999990002'),
    cli('c3', 'Carla Dias', '83999990003'),
    cli('c4', 'Dani Reis', '83999990004', { consentimento: 'revogado' }),
    cli('c5', 'Eva Rocha', '83999990005'),
    cli('c6', 'Fabi Melo', '83999990006', { active: false }),
    cli('c7', 'Gabi Nunes', '83999990007'),
  ]);
  crm.visitas.mockResolvedValue(new Map(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'].map((id) => [id, visita(40)])));
  inbox.telefonesEmOptOut.mockResolvedValue(new Set(['8399990005']));
  neg.negocio.mockResolvedValue({ nome: 'Studio', slug: 'studio', whatsapp: null });
  agenda.carregarAgendaSemana.mockResolvedValue({ tz: 'America/Sao_Paulo', profs: [{ id: 'p1', name: 'Camila Souza', almoco: null }] });
  agenda.vagasDaSemana.mockReturnValue([]);
});
afterEach(() => { delete process.env.FRONTEND_URL; });

describe('publicoService.previa', () => {
  it('conta selecionadas, receberão e resguardadas; inativa não conta', async () => {
    const r = await publicoService.previa('b1', INPUT, AGORA);
    // 7 clientes - 1 inativa = 6 em risco; Dani revogada e Eva em opt-out
    expect(r).toMatchObject({ selecionadas: 6, receberao: 4, resguardadas: 2 });
  });

  it('cinco em risco, uma revogada e uma em opt-out', async () => {
    crm.clientes.mockResolvedValue([
      cli('c1', 'Ana', '83999990001'), cli('c2', 'Bia', '83999990002'), cli('c3', 'Carla', '83999990003'),
      cli('c4', 'Dani', '83999990004', { consentimento: 'revogado' }), cli('c5', 'Eva', '83999990005'),
    ]);
    const r = await publicoService.previa('b1', INPUT, AGORA);
    expect(r).toMatchObject({ selecionadas: 5, receberao: 3, resguardadas: 2 });
  });

  it('amostra troca variáveis pela primeira elegível e põe o rodapé', async () => {
    const r = await publicoService.previa('b1', { ...INPUT, texto: 'Oi {primeiro_nome}, volte com {profissional}!' }, AGORA);
    expect(r.amostra).toEqual({
      nome: 'Ana Paula', telefone: '83999990001',
      texto: `Oi Ana, volte com Camila Souza!\n\n${RODAPE_SAIR}`,
    });
  });

  it('sem FRONTEND_URL a linha do link some', async () => {
    delete process.env.FRONTEND_URL;
    const r = await publicoService.previa('b1', { ...INPUT, texto: 'Oi {primeiro_nome}\nAgende: {link}' }, AGORA);
    expect(r.amostra?.texto).toBe(`Oi Ana\n\n${RODAPE_SAIR}`);
  });

  it('com FRONTEND_URL o link usa o slug', async () => {
    const r = await publicoService.previa('b1', { ...INPUT, texto: 'Agende: {link}' }, AGORA);
    expect(r.amostra?.texto).toContain('https://app.test/agendar/studio');
  });

  it('texto vazio gera só o rodapé', async () => {
    const r = await publicoService.previa('b1', INPUT, AGORA);
    expect(r.amostra?.texto).toBe(RODAPE_SAIR);
  });

  it('{horarios_livres} usa as vagas da semana', async () => {
    agenda.vagasDaSemana.mockReturnValue([{ data: '2026-10-21', inicio: '10:00', profissional: 'Camila Souza', professionalId: 'p1' }]);
    const r = await publicoService.previa('b1', { ...INPUT, texto: 'Vagas: {horarios_livres}' }, AGORA);
    expect(r.amostra?.texto).toContain('Qua 10:00');
    expect(agenda.carregarAgendaSemana).toHaveBeenCalledTimes(1);
  });

  it('sem elegíveis, amostra nula', async () => {
    inbox.telefonesEmOptOut.mockResolvedValue(new Set(['8399990001', '8399990002', '8399990003', '8399990005', '8399990007']));
    const r = await publicoService.previa('b1', INPUT, AGORA);
    expect(r).toMatchObject({ receberao: 0, amostra: null });
  });

  it('rejeita quando não dá para ler os opt-outs', async () => {
    inbox.telefonesEmOptOut.mockRejectedValue(new Error('db'));
    await expect(publicoService.previa('b1', INPUT, AGORA)).rejects.toThrow('db');
  });
});
