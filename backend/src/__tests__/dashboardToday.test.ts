import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const repo = vi.hoisted(() => ({
  negocio: vi.fn(),
  profissionaisAtivas: vi.fn(),
  agendamentosNasDatas: vi.fn(),
  faturamentoPorDia: vi.fn(),
  agendamentosDoMes: vi.fn(),
  sinaisPendentes: vi.fn(),
  avaliacoesRecentes: vi.fn(),
  clientesComAgendamentoFuturo: vi.fn(),
}));
const crm = vi.hoisted(() => ({ clientes: vi.fn(), visitas: vi.fn() }));
const settings = vi.hoisted(() => ({ getBusinessScheduleSettings: vi.fn() }));

vi.mock('../modules/dashboard/today.repository.js', () => ({ todayRepository: repo }));
vi.mock('../modules/crm/crm.repository.js', () => ({ crmRepository: crm }));
vi.mock('../services/scheduleSettingsService.js', () => settings);

const { todayService, minutosOcupados, minutosExpediente, vagasLivres, proximasVagas } = await import('../modules/dashboard/today.service.js');

const TZ = 'America/Sao_Paulo';
const DIAS = { seg: true, ter: true, qua: true, qui: true, sex: true, sab: false, dom: false };

let seq = 0;
const ag = (date: string, time: string, dur: number, over: Record<string, unknown> = {}) => ({
  id: `ap${++seq}`, businessId: 'b1', clientId: 'c1', professionalId: 'p1', serviceId: 's1',
  date: new Date(`${date}T00:00:00Z`), time: new Date(`1970-01-01T${time}:00Z`),
  status: 'confirmado', reminderSent: false, createdAt: new Date('2026-10-01T12:00:00Z'), source: 'painel',
  depositAmount: null, startedAt: null, expiresAt: null,
  client: { name: 'Ana', phone: '83999990000' }, professional: { name: 'Camila' },
  service: { name: 'Corte', price: 100, durationMinutes: dur }, comanda: null,
  ...over,
});

let agendamentos: ReturnType<typeof ag>[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  seq = 0;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T13:00:00-03:00')); // quarta (o brief diz terça, mas 14/10/2026 cai numa quarta)
  agendamentos = [];
  settings.getBusinessScheduleSettings.mockResolvedValue({
    openingTime: '09:00', closingTime: '19:00', slotIntervalMinutes: 30, diasAbertos: { ...DIAS }, timezone: TZ,
  });
  repo.negocio.mockResolvedValue({ ownerName: 'Camila', meta: 1800 });
  repo.profissionaisAtivas.mockResolvedValue([{ id: 'p1', name: 'Camila', almoco: { start: '12:00', end: '13:00' } }]);
  repo.agendamentosNasDatas.mockImplementation(async (_b: string, datas: string[]) =>
    agendamentos.filter((a) => datas.includes(a.date.toISOString().slice(0, 10))));
  repo.faturamentoPorDia.mockResolvedValue([{ date: '2026-10-14', valor: 1460 }, { date: '2026-10-10', valor: 300 }]);
  repo.agendamentosDoMes.mockResolvedValue([]);
  repo.sinaisPendentes.mockResolvedValue([]);
  repo.avaliacoesRecentes.mockResolvedValue([]);
  repo.clientesComAgendamentoFuturo.mockResolvedValue(new Set());
  crm.clientes.mockResolvedValue([]);
  crm.visitas.mockResolvedValue(new Map());
});
afterEach(() => vi.useRealTimers());

describe('funções puras', () => {
  it('expediente desconta o almoço', () => {
    expect(minutosExpediente(9 * 60, 19 * 60, { start: '12:00', end: '13:00' })).toBe(540);
    expect(minutosExpediente(9 * 60, 19 * 60, null)).toBe(600);
  });
  it('minutos ocupados ficam limitados ao expediente e fora do almoço', () => {
    // 08:00–10:00 → só 09–10 conta; 11:30–12:30 → só 11:30–12:00 conta
    expect(minutosOcupados(9 * 60, 19 * 60, { start: '12:00', end: '13:00' }, [
      { inicio: 8 * 60, duracao: 120 }, { inicio: 11 * 60 + 30, duracao: 60 },
    ])).toBe(90);
  });
  it('vagas livres: buracos >= 30 min, fora do almoço e dos agendamentos', () => {
    expect(vagasLivres(13 * 60, 19 * 60, { start: '15:00', end: '16:00' }, [{ inicio: 13 * 60, duracao: 60 }, { inicio: 16 * 60 + 20, duracao: 160 }]))
      .toEqual([{ inicio: '14:00', fim: '15:00' }]); // 16:00–16:20 tem 20 min
  });
});

describe('todayService.resumo', () => {
  it('1. faturamento com meta e sem meta', async () => {
    const r = await todayService.resumo('b1');
    expect(r.faturamento).toEqual({ valor: 1460, meta: 1800, percentual: 81 });
    expect(r.saudacao).toEqual({ ownerName: 'Camila', date: '2026-10-14' });
    expect(r.semana).toHaveLength(7);
    expect(r.semana[0]).toEqual({ data: '2026-10-08', valor: 0 });
    expect(r.semana[2]).toEqual({ data: '2026-10-10', valor: 300 });
    expect(r.semana[6]).toEqual({ data: '2026-10-14', valor: 1460 });

    repo.negocio.mockResolvedValue({ ownerName: 'Camila', meta: null });
    const s = await todayService.resumo('b1');
    expect(s.faturamento).toEqual({ valor: 1460, meta: null, percentual: null });
  });

  it('2. ocupação 50% e variação vs média das 4 quartas anteriores', async () => {
    agendamentos = [
      ag('2026-10-14', '09:00', 90), ag('2026-10-14', '10:30', 90), ag('2026-10-14', '14:00', 90), // 270 min
      ag('2026-10-14', '16:00', 60, { status: 'cancelado' }), // não conta
      // 240 min em cada quarta anterior → 44,4%
      ...['2026-10-07', '2026-09-30', '2026-09-23', '2026-09-16'].flatMap((d) => [ag(d, '09:00', 120), ag(d, '14:00', 120)]),
    ];
    const r = await todayService.resumo('b1');
    expect(r.ocupacao).toEqual({ percentual: 50, variacao: 6, diaDaSemana: 'quarta' });
    expect(r.agendamentos.total).toBe(3);
    expect(repo.agendamentosNasDatas).toHaveBeenCalledWith('b1', ['2026-10-14', '2026-10-07', '2026-09-30', '2026-09-23', '2026-09-16']);
  });

  it('3. negócio fechado hoje ou sem profissional ativa → ocupação null', async () => {
    settings.getBusinessScheduleSettings.mockResolvedValue({
      openingTime: '09:00', closingTime: '19:00', slotIntervalMinutes: 30, diasAbertos: { ...DIAS, qua: false }, timezone: TZ,
    });
    const fechado = await todayService.resumo('b1');
    expect(fechado.ocupacao).toBeNull();
    expect(fechado.agendamentos.livresTarde).toBe(0);

    settings.getBusinessScheduleSettings.mockResolvedValue({
      openingTime: '09:00', closingTime: '19:00', slotIntervalMinutes: 30, diasAbertos: { ...DIAS }, timezone: TZ,
    });
    repo.profissionaisAtivas.mockResolvedValue([]);
    const semProf = await todayService.resumo('b1');
    expect(semProf.ocupacao).toBeNull();
  });

  it('4. vagas da tarde começam agora (13:00), ignoram o almoço e buracos < 30 min', async () => {
    repo.profissionaisAtivas.mockResolvedValue([
      { id: 'p1', name: 'Camila', almoco: { start: '12:00', end: '13:00' } },
      { id: 'p2', name: 'Bruna', almoco: { start: '15:00', end: '16:00' } },
    ]);
    agendamentos = [
      ag('2026-10-14', '13:00', 60), // p1 13–14
      ag('2026-10-14', '14:20', 100), // p1 14:20–16:00 → buraco 14:00–14:20 (20 min) não conta
    ];
    const r = await todayService.resumo('b1');
    // p1: 16–19 · p2: 13–15 e 16–19 (manhã livre de 09–12 não entra)
    expect(r.agendamentos.livresTarde).toBe(3);
    const vagas = r.pendencias.find((p) => p.tipo === 'vagas_tarde');
    expect(vagas).toEqual({
      tipo: 'vagas_tarde', quantidade: 3,
      vagas: [
        { profissional: 'Bruna', professionalId: 'p2', inicio: '13:00', fim: '15:00' },
        { profissional: 'Camila', professionalId: 'p1', inicio: '16:00', fim: '19:00' },
        { profissional: 'Bruna', professionalId: 'p2', inicio: '16:00', fim: '19:00' },
      ],
    });
  });

  it('5. pendências vazias não aparecem; ordem fixa', async () => {
    // agenda cheia à tarde → sem vagas_tarde
    agendamentos = [ag('2026-10-14', '13:00', 360)];
    const vazio = await todayService.resumo('b1');
    expect(vazio.pendencias).toEqual([]);

    agendamentos = [];
    crm.clientes.mockResolvedValue([
      { id: 'c1', name: 'Ana', phone: '839', active: true },
      { id: 'c2', name: 'Bia', phone: '838', active: true },
      { id: 'c3', name: 'Cris', phone: '837', active: true }, // tem agendamento futuro
      { id: 'c4', name: 'Duda', phone: '836', active: false }, // inativa
    ]);
    const v = (date: string) => ({ date, receita: 100, servico: 'Manutenção', profissional: 'Camila', professionalId: 'p1' });
    crm.visitas.mockResolvedValue(new Map([
      ['c1', [v('2026-08-20'), v('2026-09-10')]], // ciclo 21 → previsto 01/10 → venceu há 13
      ['c2', [v('2026-09-01'), v('2026-09-29')]], // ciclo 28 → previsto 27/10 → não venceu
      ['c3', [v('2026-08-01'), v('2026-08-31')]],
      ['c4', [v('2026-08-01'), v('2026-08-31')]],
    ]));
    repo.clientesComAgendamentoFuturo.mockResolvedValue(new Set(['c3']));
    repo.sinaisPendentes.mockResolvedValue([
      { depositAmount: 39, expiresAt: new Date('2026-10-14T13:12:00-03:00') },
      { depositAmount: 30, expiresAt: new Date('2026-10-14T13:05:00-03:00') },
      { depositAmount: 50, expiresAt: new Date('2026-10-14T12:50:00-03:00') }, // expirado
    ]);
    repo.avaliacoesRecentes.mockResolvedValue([
      { clientId: 'c1', cliente: 'Ana', phone: '839', nota: 2, comentario: 'Atrasou', data: '2026-10-12T15:00:00.000Z' },
      { clientId: 'c2', cliente: 'Bia', phone: '838', nota: 5, comentario: null, data: '2026-10-13T15:00:00.000Z' },
    ]);
    const r = await todayService.resumo('b1');
    expect(r.pendencias.map((p) => p.tipo)).toEqual(['vagas_tarde', 'retorno_vencido', 'sinais_pix', 'avaliacao']);
    expect(r.pendencias[1]).toEqual({
      tipo: 'retorno_vencido', quantidade: 1,
      clientes: [{ id: 'c1', name: 'Ana', phone: '839', servico: 'Manutenção', venceuHa: 13 }],
    });
    expect(r.pendencias[2]).toEqual({ tipo: 'sinais_pix', quantidade: 2, total: 69, expiraEmMinutos: 5 });
    expect(r.pendencias[3]).toEqual({
      tipo: 'avaliacao', quantidade: 1,
      avaliacoes: [{ clientId: 'c1', cliente: 'Ana', phone: '839', nota: 2, comentario: 'Atrasou', data: '2026-10-12T15:00:00.000Z' }],
    });
  });

  it('6. confirmados por lembrete contam só concluídos com lembrete', async () => {
    repo.agendamentosDoMes.mockResolvedValue([
      { status: 'concluido', reminderSent: true, receita: 100 },
      { status: 'concluido', reminderSent: true, receita: 150.5 },
      { status: 'concluido', reminderSent: false, receita: 200 },
      { status: 'confirmado', reminderSent: true, receita: 120 },
      { status: 'faltou', reminderSent: true, receita: 120 },
    ]);
    const r = await todayService.resumo('b1');
    expect(r.confirmadosLembrete).toEqual({ quantidade: 2, valor: 250.5 });
    expect(repo.agendamentosDoMes).toHaveBeenCalledWith('b1', '2026-10-01', '2026-10-14');
  });

  it('próximas 2 h: confirmado/em_atendimento/aguardando não expirado, no formato de GET /appointments', async () => {
    agendamentos = [
      ag('2026-10-14', '11:00', 60), // passou
      ag('2026-10-14', '12:30', 60, { status: 'em_atendimento' }), // em andamento
      ag('2026-10-14', '13:30', 60),
      ag('2026-10-14', '14:00', 30, { status: 'aguardando_pagamento', expiresAt: new Date('2026-10-14T13:10:00-03:00') }),
      ag('2026-10-14', '14:30', 30, { status: 'aguardando_pagamento', expiresAt: new Date('2026-10-14T12:55:00-03:00') }), // expirado
      ag('2026-10-14', '14:45', 30, { status: 'cancelado' }),
      ag('2026-10-14', '15:30', 30), // além de 2 h
    ];
    const r = await todayService.resumo('b1');
    expect(r.proximas.map((a) => a.time)).toEqual(['12:30:00', '13:30:00', '14:00:00']);
    expect(r.proximas[1]).toMatchObject({ professional_name: 'Camila', service_duration_minutes: 60, date: '2026-10-14T00:00:00' });
  });
});

describe('proximasVagas', () => {
  const ABERTO = { openingTime: '09:00', closingTime: '18:00', slotIntervalMinutes: 30, timezone: TZ,
    diasAbertos: { dom: true, seg: true, ter: true, qua: true, qui: true, sex: true, sab: true } };
  beforeEach(() => {
    settings.getBusinessScheduleSettings.mockResolvedValue({ ...ABERTO });
    repo.profissionaisAtivas.mockResolvedValue([{ id: 'p1', name: 'Camila', almoco: null }]);
    agendamentos = [ag('2026-10-14', '10:00', 60)];
  });
  const AGORA = new Date('2026-10-14T09:30:00-03:00');

  it('lista as primeiras vagas a partir de agora, por data e início', async () => {
    const r = await proximasVagas('b1', AGORA, 3);
    expect(r).toEqual([
      { data: '2026-10-14', inicio: '09:30', profissional: 'Camila', professionalId: 'p1' },
      { data: '2026-10-14', inicio: '11:00', profissional: 'Camila', professionalId: 'p1' },
      { data: '2026-10-15', inicio: '09:00', profissional: 'Camila', professionalId: 'p1' },
    ]);
    expect(repo.agendamentosNasDatas).toHaveBeenCalledWith('b1',
      ['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20']);
  });

  it('hoje fechado: a primeira vaga é de amanhã', async () => {
    settings.getBusinessScheduleSettings.mockResolvedValue({ ...ABERTO, diasAbertos: { ...ABERTO.diasAbertos, qua: false } });
    const r = await proximasVagas('b1', AGORA, 3);
    expect(r[0]).toEqual({ data: '2026-10-15', inicio: '09:00', profissional: 'Camila', professionalId: 'p1' });
  });

  it('respeita o limite', async () => {
    expect(await proximasVagas('b1', AGORA, 1)).toHaveLength(1);
  });

  it('professionalId só devolve vagas dela', async () => {
    repo.profissionaisAtivas.mockResolvedValue([
      { id: 'p1', name: 'Camila', almoco: null }, { id: 'p2', name: 'Bruna', almoco: null },
    ]);
    const r = await proximasVagas('b1', AGORA, 20, { professionalId: 'p2' });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((v) => v.professionalId === 'p2' && v.profissional === 'Bruna')).toBe(true);
  });

  it('duracaoMinima ignora janelas menores', async () => {
    // p1 ocupada 10:00-11:00 e 11:30-18:00 em 14/10: sobram 09:30-10:00 e 11:00-11:30 (30 min cada)
    agendamentos = [ag('2026-10-14', '10:00', 60), ag('2026-10-14', '11:30', 390)];
    const todas = await proximasVagas('b1', AGORA, 2);
    expect(todas.map((v) => [v.data, v.inicio])).toEqual([['2026-10-14', '09:30'], ['2026-10-14', '11:00']]);
    const longas = await proximasVagas('b1', AGORA, 2, { duracaoMinima: 60 });
    expect(longas.every((v) => v.data !== '2026-10-14')).toBe(true);
    expect(longas[0]).toEqual({ data: '2026-10-15', inicio: '09:00', profissional: 'Camila', professionalId: 'p1' });
  });
});
