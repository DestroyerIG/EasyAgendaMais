import { describe, it, expect, vi, beforeEach } from 'vitest';

const repo = vi.hoisted(() => ({
  comandasFechadas: vi.fn(), agendamentos: vi.fn(), configuracao: vi.fn(), visitasConcluidas: vi.fn(),
  enviosDeRetorno: vi.fn(), profissionais: vi.fn(),
}));
vi.mock('../modules/reports/reports.repository.js', () => ({ reportsRepository: repo }));
vi.mock('../services/scheduleSettingsService.js', () => ({
  getBusinessScheduleSettings: vi.fn().mockResolvedValue({
    timezone: 'America/Sao_Paulo', openingTime: '09:00', closingTime: '18:00',
    diasAbertos: { seg: true, ter: true, qua: true, qui: true, sex: true, sab: false, dom: false },
  }),
}));

const { relatoriosService } = await import('../modules/reports/relatorios.service.js');

const P = { inicio: '2026-10-01', fim: '2026-10-24' };
const comanda = (id: string, appointmentId: string, servicos: number, produtos = 0, desconto = 0, closedAt = '2026-10-10T15:00:00Z') => ({
  id, professionalId: 'p1', clientId: 'c1', closedAt: new Date(closedAt), items: [],
  servicesTotal: String(servicos), productsTotal: String(produtos), discountAmount: String(desconto), tipAmount: '20',
  appointment: { id: appointmentId },
});
const ag = (id: string, over: Record<string, unknown> = {}) => ({
  id, clientId: 'c1', professionalId: 'p1', date: new Date('2026-10-10T00:00:00Z'), time: new Date('1970-01-01T10:00:00Z'),
  status: 'concluido', source: 'painel', createdAt: new Date('2026-10-08T12:00:00Z'), service: { durationMinutes: 60 }, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-24T12:00:00-03:00'));
  repo.configuracao.mockResolvedValue({ metaDiaria: 500, lembretes: true, sinalPix: true });
  repo.visitasConcluidas.mockResolvedValue([]);
  repo.enviosDeRetorno.mockResolvedValue([]);
});

describe('visão geral', () => {
  it('ticket sem gorjeta, faltas, meta do mês e origem com atribuição de campanha', async () => {
    const atuais = [comanda('k1', 'a1', 100, 50, 10), comanda('k2', 'a2', 200)];
    repo.comandasFechadas.mockImplementation(async (_b: string, i: { gte: Date }) =>
      i.gte.toISOString().startsWith('2026-10-01') ? atuais : [comanda('k0', 'a0', 100)]);
    repo.agendamentos.mockImplementation(async (_b: string, p: { inicio: string }) => p.inicio === P.inicio
      ? [ag('a1', { source: 'publico', clientId: 'c2' }), ag('a2'), ag('a3', { status: 'faltou' }), ag('a4', { status: 'cancelado' })]
      : [ag('a0')]);
    repo.enviosDeRetorno.mockResolvedValue([{ clientId: 'c2', sentAt: new Date('2026-10-05T12:00:00Z') }]);

    const r = await relatoriosService.visaoGeral('b1', P);
    expect(r.faturamento).toBe(340);
    expect(r.indicadores.ticketMedio).toMatchObject({ valor: 170, anterior: 100, variacao: 70 });
    expect(r.indicadores.faltas.valor).toBe(33.3);
    // Outubro/2026 tem 22 dias úteis × R$ 500
    expect(r.indicadores.faturamentoMes).toMatchObject({ valor: 340, meta: 11000, percentual: 3 });
    expect(r.origem.total).toBe(3);
    const porId = Object.fromEntries(r.origem.itens.map((o) => [o.id, o]));
    expect(porId.retorno_campanhas).toMatchObject({ quantidade: 1, faturamento: 140 });
    expect(porId.publico.quantidade).toBe(0);
    expect(porId.painel).toMatchObject({ quantidade: 2, faturamento: 200 });
    expect(r.rodape.produtosPercentual).toBe(14);
  });

  it('sem nada no período: indicadores nulos e origem vazia', async () => {
    repo.comandasFechadas.mockResolvedValue([]);
    repo.agendamentos.mockResolvedValue([]);
    repo.configuracao.mockResolvedValue({ metaDiaria: null, lembretes: true, sinalPix: false });
    const r = await relatoriosService.visaoGeral('b1', P);
    expect(r.indicadores.ticketMedio.valor).toBeNull();
    expect(r.indicadores.faltas.valor).toBeNull();
    expect(r.indicadores.faturamentoMes.meta).toBeNull();
    expect(r.origem).toEqual({ total: 0, itens: [] });
    expect(repo.enviosDeRetorno).not.toHaveBeenCalled();
  });
});

describe('evolução', () => {
  it('6 meses até o atual, com projeção só no mês atual', async () => {
    repo.comandasFechadas.mockResolvedValue([
      comanda('k1', 'a1', 100, 0, 0, '2026-10-01T02:00:00Z'), // 30/09 23h no fuso → setembro
      comanda('k2', 'a2', 240, 0, 0, '2026-10-10T15:00:00Z'),
    ]);
    const { meses } = await relatoriosService.evolucao('b1');
    expect(meses.map((m) => m.mes)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    expect(meses[4]).toMatchObject({ total: 100, projecao: null, atual: false });
    expect(meses[5]).toMatchObject({ total: 240, atual: true, projecao: 310 });
  });
});
