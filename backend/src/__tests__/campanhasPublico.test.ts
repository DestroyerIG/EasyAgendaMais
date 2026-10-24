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
const real = await vi.importActual<typeof import('../modules/dashboard/today.service.js')>('../modules/dashboard/today.service.js');

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

  it('{horarios_livres} usa as vagas da semana, juntas com " ou "', async () => {
    agenda.vagasDaSemana.mockReturnValue([
      { data: '2026-10-21', inicio: '13:00', profissional: 'Camila Souza', professionalId: 'p1' },
      { data: '2026-10-22', inicio: '09:00', profissional: 'Camila Souza', professionalId: 'p1' },
    ]);
    const r = await publicoService.previa('b1', { ...INPUT, texto: 'Vagas: {horarios_livres}' }, AGORA);
    expect(r.amostra?.texto).toContain('Vagas: Qua 13:00 ou Qui 09:00');
    expect(agenda.carregarAgendaSemana).toHaveBeenCalledTimes(1);
  });

  it('prévia: a amostra (primeira da fila) só recebe vagas a partir do início + 2 h', async () => {
    await publicoService.previa('b1', { ...INPUT, texto: 'Vagas: {horarios_livres}' }, AGORA);
    // Início da prévia: amanhã 10:00 (13:00Z); primeira da fila sai no início.
    expect(agenda.carregarAgendaSemana).toHaveBeenCalledWith('b1', new Date('2026-10-21T13:00:00Z'));
    expect(agenda.vagasDaSemana.mock.calls[0][2]).toMatchObject({ aPartirDe: new Date('2026-10-21T15:00:00Z') });
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

describe('publicoService.montar: horários livres por posição na fila', () => {
  const INICIO = new Date('2026-10-21T13:00:00Z'); // quarta 10:00 em São Paulo
  const DIAS7 = ['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'];
  const semana = {
    tz: 'America/Sao_Paulo', hoje: '2026-10-21', datas: DIAS7, agora: INICIO,
    abertura: 9 * 60, fechamento: 18 * 60,
    diasAbertos: { dom: true, seg: true, ter: true, qua: true, qui: true, sex: true, sab: true },
    profs: [{ id: 'p1', name: 'Camila Souza', almoco: null }],
    ags: [],
  };
  const muitas = (n: number) => Array.from({ length: n }, (_, i) => cli(`k${i}`, `Cli${i} Teste`, `839999${String(10000 + i)}`));
  beforeEach(() => {
    crm.clientes.mockResolvedValue(muitas(60));
    crm.visitas.mockResolvedValue(new Map(muitas(60).map((c) => [c.id, visita(40)])));
    inbox.telefonesEmOptOut.mockResolvedValue(new Set());
    agenda.carregarAgendaSemana.mockResolvedValue(semana);
    agenda.vagasDaSemana.mockImplementation(real.vagasDaSemana);
  });

  it('a semana é carregada uma vez só, a partir do início', async () => {
    await publicoService.montar('b1', INPUT, INICIO, 25, AGORA);
    expect(agenda.carregarAgendaSemana).toHaveBeenCalledTimes(1);
    expect(agenda.carregarAgendaSemana).toHaveBeenCalledWith('b1', INICIO);
  });

  it('cliente 0 e cliente 50 (25/h, 2 h depois) recebem vagas diferentes e posteriores', async () => {
    const { elegiveis } = await publicoService.montar('b1', INPUT, INICIO, 25, AGORA);
    // 0 sai às 10:00 → vagas a partir das 12:00; 50 sai às 10:00 + 50 × 144 s = 12:00 → a partir das 14:00.
    expect(elegiveis[0].vars.horarios_livres).toBe('Qua 12:00 ou Qui 09:00');
    expect(elegiveis[50].vars.horarios_livres).toBe('Qua 14:00 ou Qui 09:00');
  });

  it('nenhuma vaga antes da previsão de envio + 2 h', async () => {
    // Agenda com buracos ao longo do dia para que o corte apareça em vários pontos.
    agenda.carregarAgendaSemana.mockResolvedValue({
      ...semana,
      ags: [
        { date: new Date('2026-10-21T00:00:00Z'), time: new Date('1970-01-01T12:30:00Z'), status: 'confirmado', expiresAt: null, professionalId: 'p1', service: { durationMinutes: 60 } },
        { date: new Date('2026-10-21T00:00:00Z'), time: new Date('1970-01-01T15:00:00Z'), status: 'confirmado', expiresAt: null, professionalId: 'p1', service: { durationMinutes: 30 } },
      ],
    });
    const cadencia = 25;
    const { elegiveis } = await publicoService.montar('b1', { ...INPUT }, INICIO, cadencia, AGORA);
    expect(elegiveis).toHaveLength(60);
    elegiveis.forEach((_, idx) => {
      const minimo = INICIO.getTime() + (idx * 3600 * 1000) / cadencia + 2 * 3_600_000;
      const vagas = agenda.vagasDaSemana.mock.results[idx].value as Array<{ data: string; inicio: string }>;
      for (const v of vagas) {
        const em = Date.parse(`${v.data}T${v.inicio}:00-03:00`);
        expect(em).toBeGreaterThanOrEqual(minimo);
      }
    });
  });

  it('cadência maior aproxima as vagas do início (60/h: cliente 50 sai 50 min depois)', async () => {
    const { elegiveis } = await publicoService.montar('b1', INPUT, INICIO, 60, AGORA);
    // 10:50 + 2 h = 12:50 → arredonda para 13:00.
    expect(elegiveis[50].vars.horarios_livres).toBe('Qua 13:00 ou Qui 09:00');
  });

  it('cliente sem vaga depois do próprio corte fica sem horários (a linha some no texto)', async () => {
    crm.clientes.mockResolvedValue(muitas(3));
    crm.visitas.mockResolvedValue(new Map(muitas(3).map((c) => [c.id, visita(40)])));
    // Só a quarta aberta, até 13:00; o último serviço dura 60 min.
    agenda.carregarAgendaSemana.mockResolvedValue({ ...semana, diasAbertos: { qua: true }, fechamento: 13 * 60 });
    const { elegiveis } = await publicoService.montar('b1', INPUT, INICIO, 10, AGORA);
    // 0: corte 12:00 → 12:00–13:00 cabe. 1 (10/h): sai 10:06 → corte 12:06 → 12:30 → sobra 30 min < 60: nada.
    expect(elegiveis[0].vars.horarios_livres).toBe('Qua 12:00');
    expect(elegiveis[1].vars.horarios_livres).toBe('');
    expect(elegiveis[2].vars.horarios_livres).toBe('');
  });
});
