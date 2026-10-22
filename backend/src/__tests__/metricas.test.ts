import { describe, it, expect, vi, beforeEach } from 'vitest';

const repo = vi.hoisted(() => ({
  receitaAutomacoes: vi.fn(), sinaisRecebidos: vi.fn(), confirmadosPeloCliente: vi.fn(), pedidosDeReagendar: vi.fn(),
  respostas: vi.fn(), vagasPreenchidas: vi.fn(), lembretes: vi.fn(), aniversario: vi.fn(), avaliacoes: vi.fn(),
}));
const inbox = vi.hoisted(() => ({ historicoEnvios: vi.fn(), dadosConexao: vi.fn() }));
const zap = vi.hoisted(() => ({ getStatus: vi.fn() }));
const settings = vi.hoisted(() => ({ get: vi.fn() }));
const db = vi.hoisted(() => ({ $queryRaw: vi.fn(), whatsappMessage: { count: vi.fn() } }));

vi.mock('../config/prisma.js', () => ({ prisma: db }));
vi.mock('../modules/whatsappAutomacoes/metricas.repository.js', () => ({ metricasRepository: repo }));
vi.mock('../modules/whatsappInbox/inbox.repository.js', () => ({ inboxRepository: inbox }));
vi.mock('../modules/whatsapp/whatsapp.service.js', () => ({ whatsappService: zap }));
vi.mock('../services/scheduleSettingsService.js', () => ({ getBusinessScheduleSettings: settings.get }));

const { metricas, ORIGENS_REGRAS } = await import('../modules/whatsappAutomacoes/metricas.service.js');

const agora = new Date('2026-10-21T15:00:00-03:00');
const MES = new Date('2026-10-01T00:00:00-03:00');
const PROXIMO = new Date('2026-11-01T00:00:00-03:00');
const ANTERIOR = new Date('2026-09-01T00:00:00-03:00');

beforeEach(() => {
  vi.resetAllMocks();
  settings.get.mockResolvedValue({ timezone: 'America/Sao_Paulo' });
  repo.receitaAutomacoes.mockResolvedValue({ retorno: 0, outros: 0 });
  repo.sinaisRecebidos.mockResolvedValue(0);
  repo.confirmadosPeloCliente.mockResolvedValue(0);
  repo.pedidosDeReagendar.mockResolvedValue(0);
  repo.respostas.mockResolvedValue({ total: 0, respondidas: 0, mediaMin: null });
  repo.vagasPreenchidas.mockResolvedValue(0);
  repo.lembretes.mockResolvedValue({ enviados: 0, lidos: 0 });
  repo.aniversario.mockResolvedValue({ aniversariantes: 0, agendamentos: 0 });
  repo.avaliacoes.mockResolvedValue({ media: null, novas: 0 });
  zap.getStatus.mockResolvedValue({ status: 'connected', connectedNumber: '5583999990000' });
  inbox.dadosConexao.mockResolvedValue({ whatsapp: null, whatsappConnectedAt: null });
});

describe('metricas.painel', () => {
  it('usa o mês corrente e o anterior no fuso do negócio', async () => {
    await metricas.painel('b1', agora);
    expect(repo.receitaAutomacoes).toHaveBeenCalledWith('b1', MES, PROXIMO);
    expect(repo.receitaAutomacoes).toHaveBeenCalledWith('b1', ANTERIOR, MES);
    expect(repo.avaliacoes).toHaveBeenCalledWith('b1', MES, PROXIMO);
  });

  it('variação null quando o mês anterior é 0', async () => {
    repo.receitaAutomacoes.mockImplementation(async (_b: string, inicio: Date) =>
      (inicio.getTime() === MES.getTime() ? { retorno: 300, outros: 0 } : { retorno: 0, outros: 0 }));
    const p = await metricas.painel('b1', agora);
    expect(p.receitaMes).toBe(300);
    expect(p.receitaVariacaoPct).toBeNull();
  });

  it('2870 contra 2517,5 dá 14%, somando retorno, outros e sinais', async () => {
    repo.receitaAutomacoes.mockImplementation(async (_b: string, inicio: Date) =>
      (inicio.getTime() === MES.getTime() ? { retorno: 1200, outros: 1500 } : { retorno: 2000, outros: 400 }));
    repo.sinaisRecebidos.mockImplementation(async (_b: string, inicio: Date) => (inicio.getTime() === MES.getTime() ? 170 : 117.5));
    const p = await metricas.painel('b1', agora);
    expect(p.receitaMes).toBe(2870);
    expect(p.receitaVariacaoPct).toBe(14);
    expect(p.porRegra.retorno.recuperado).toBe(1200);
    expect(p.porRegra.sinal_pix.recebido).toBe(170);
  });

  it('selo null quando não houve mensagem', async () => {
    const p = await metricas.painel('b1', agora);
    expect(p.taxaResposta).toEqual({ pct: null, mediaMin: null, selo: null });
  });

  it('taxa de resposta com selo e média arredondada', async () => {
    repo.respostas.mockResolvedValue({ total: 10, respondidas: 8, mediaMin: 12.6 });
    expect((await metricas.painel('b1', agora)).taxaResposta).toEqual({ pct: 80, mediaMin: 13, selo: 'Excelente' });
    repo.respostas.mockResolvedValue({ total: 10, respondidas: 5, mediaMin: 3 });
    expect((await metricas.painel('b1', agora)).taxaResposta.selo).toBe('Boa');
    repo.respostas.mockResolvedValue({ total: 10, respondidas: 4, mediaMin: 3 });
    expect((await metricas.painel('b1', agora)).taxaResposta.selo).toBe('Baixa');
  });

  it('faltas evitadas somam confirmações e pedidos de reagendar', async () => {
    repo.confirmadosPeloCliente.mockResolvedValue(7);
    repo.pedidosDeReagendar.mockResolvedValue(2);
    const p = await metricas.painel('b1', agora);
    expect(p.faltasEvitadas).toBe(9);
    expect(p.porRegra.confirmacao.faltasEvitadas).toBe(9);
  });

  it('nota média com 1 casa (4,94 → 4,9) e lidos em %', async () => {
    repo.avaliacoes.mockResolvedValue({ media: 4.94, novas: 17 });
    repo.lembretes.mockResolvedValue({ enviados: 3, lidos: 2 });
    const p = await metricas.painel('b1', agora);
    expect(p.porRegra.avaliacao).toEqual({ notaMedia: 4.9, novas: 17 });
    expect(p.porRegra.lembrete).toEqual({ enviados: 3, lidosPct: 67 });
  });

  it('lidosPct null sem lembretes; conexão com número', async () => {
    const p = await metricas.painel('b1', agora);
    expect(p.porRegra.lembrete.lidosPct).toBeNull();
    expect(p.conexao).toEqual({ conectado: true, numero: '5583999990000' });
  });
});

describe('metricas.historico', () => {
  it('pede só as origens das 7 regras e descarta as demais', async () => {
    inbox.historicoEnvios.mockResolvedValue([
      { id: 'm1', createdAt: new Date('2026-10-21T12:00:00Z'), origin: 'lembrete', status: 'lida', phoneKey: '8399990000',
        conversation: { phone: '5583999990000', client: { name: 'Ana' } } },
      { id: 'm2', createdAt: new Date('2026-10-21T11:00:00Z'), origin: 'manual_painel', status: 'enviada', phoneKey: '8399990000',
        conversation: null },
      { id: 'm3', createdAt: new Date('2026-10-21T10:00:00Z'), origin: 'campanha', status: 'enviada', phoneKey: '8399990000',
        conversation: null },
    ]);
    const r = await metricas.historico('b1', 30);
    expect(inbox.historicoEnvios).toHaveBeenCalledWith('b1', 30, ORIGENS_REGRAS);
    expect(r.itens.map((i) => i.id)).toEqual(['m1']);
    expect(r.itens[0]).toMatchObject({ cliente: 'Ana', tipo: 'lembrete', status: 'lida', criadaEm: '2026-10-21T12:00:00.000Z' });
  });
});

describe('metricasRepository (SQL)', () => {
  type Repo = typeof import('../modules/whatsappAutomacoes/metricas.repository.js');
  const real = () => vi.importActual<Repo>('../modules/whatsappAutomacoes/metricas.repository.js');
  const textoSql = () => (db.$queryRaw.mock.calls[0]![0] as TemplateStringsArray).join('?')
    + (db.$queryRaw.mock.calls[0]!.slice(1) as Array<{ sql?: string }>).map((v) => v?.sql ?? '').join(' ');

  it('receita da lista de espera vem da mensagem lista_espera (não de waitlist_entries.offered_at)', async () => {
    db.$queryRaw.mockResolvedValue([{ retorno: 0, outros: 0 }]);
    const { metricasRepository } = await real();
    await metricasRepository.receitaAutomacoes('b1', new Date(), new Date());
    const sql = textoSql();
    expect(sql).not.toContain('waitlist_entries');
    expect(sql).toMatch(/whatsapp_messages m[\s\S]*m\.origin = 'lista_espera'[\s\S]*m\.status <> 'falhou'[\s\S]*m\.phone_key = /);
    expect(sql).toContain("interval '7 days'");
  });

  it('vagas preenchidas: agendamentos de quem recebeu lista_espera, com o mesmo critério da receita', async () => {
    db.$queryRaw.mockResolvedValue([{ total: 4 }]);
    const { metricasRepository } = await real();
    expect(await metricasRepository.vagasPreenchidas('b1', new Date(), new Date())).toBe(4);
    const sqlVagas = textoSql();
    expect(sqlVagas).not.toContain('waitlist_entries');
    expect(sqlVagas).toContain('FROM appointments a');
    expect(sqlVagas).toMatch(/a\.status NOT IN \('cancelado', 'aguardando_pagamento'\)/);
    db.$queryRaw.mockClear();
    db.$queryRaw.mockResolvedValue([{ retorno: 0, outros: 0 }]);
    await metricasRepository.receitaAutomacoes('b1', new Date(), new Date());
    const sqlReceita = textoSql();
    const trecho = sqlVagas.match(/EXISTS \(SELECT 1 FROM whatsapp_messages m[\s\S]*?ac\.criada\)/)?.[0];
    expect(trecho).toMatch(/m\.origin = 'lista_espera'[\s\S]*m\.status <> 'falhou'[\s\S]*interval '7 days'/);
    expect(sqlReceita).toContain(trecho!);
  });

  it('taxa de resposta ignora mensagens que falharam', async () => {
    db.$queryRaw.mockResolvedValue([{ total: 0, respondidas: 0, media: null }]);
    const { metricasRepository } = await real();
    await metricasRepository.respostas('b1', new Date(), new Date());
    expect(textoSql()).toContain("m.status <> 'falhou'");
  });

  it('conta os pedidos de reagendar pelo texto único do aviso', async () => {
    db.whatsappMessage.count.mockResolvedValue(2);
    const { metricasRepository } = await real();
    const { TEXTO_REAGENDAR } = await import('../modules/whatsappAutomacoes/automacoes.rules.js');
    expect(await metricasRepository.pedidosDeReagendar('b1', new Date(), new Date())).toBe(2);
    expect(db.whatsappMessage.count.mock.calls[0]![0].where.body).toBe(TEXTO_REAGENDAR);
  });
});
