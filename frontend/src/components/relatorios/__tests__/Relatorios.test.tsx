import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Evolucao, Ocupacao, VisaoGeral } from '@/lib/relatorios';
import { quinzenaDe, quinzenaVizinha, rotuloPeriodo } from '@/lib/relatorios';

const api = vi.hoisted(() => ({ visaoGeral: vi.fn(), ocupacao: vi.fn(), evolucao: vi.fn() }));
vi.mock('@/lib/relatorios', async (orig) => ({ ...(await orig<typeof import('@/lib/relatorios')>()), relatoriosApi: api }));
vi.mock('@/lib/relatoriosPdf', () => ({ pdfRelatorio: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: 'tenant_admin', businessName: 'Studio Aurora' } }) }));

const { RelatoriosModule } = await import('../RelatoriosModule');

const visao = (over: Partial<VisaoGeral['indicadores']> = {}): VisaoGeral => ({
  periodo: { inicio: '2026-09-25', fim: '2026-10-24' },
  anterior: { inicio: '2026-08-26', fim: '2026-09-24' },
  indicadores: {
    ticketMedio: { valor: 132.5, anterior: 122.2, variacao: 8.4 },
    retornoNoCiclo: { valor: 72, base: 40, variacao: 5 },
    faltas: { valor: 2.8, variacao: -6.2, sinalPix: true, lembretes: true },
    faturamentoMes: { valor: 34180, meta: 38000, percentual: 90 },
    ...over,
  },
  faturamento: 34180,
  comandas: 258,
  origem: {
    total: 336,
    itens: [
      { id: 'publico', rotulo: 'Página pública', quantidade: 148, percentual: 44, faturamento: 15040 },
      { id: 'whatsapp', rotulo: 'Bot do WhatsApp', quantidade: 104, percentual: 31, faturamento: 10590 },
      { id: 'painel', rotulo: 'Balcão / painel', quantidade: 50, percentual: 15, faturamento: 4060 },
      { id: 'retorno_campanhas', rotulo: 'Hora de voltar e campanhas', quantidade: 34, percentual: 10, faturamento: 4490 },
    ],
  },
  rodape: { produtosPercentual: 23, projecaoMes: 38450, diasRestantes: 7 },
});

const celulas = (v: number | null) =>
  (['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'] as const).flatMap((dia) =>
    (['manha', 'tarde'] as const).map((turno) => ({ dia, turno, ocupacao: dia === 'dom' || dia === 'seg' ? null : v })));

const ocupacao = (over: Partial<Ocupacao> = {}): Ocupacao => ({
  periodo: { inicio: '2026-09-25', fim: '2026-10-24' },
  diasAbertos: { seg: false, ter: true, qua: true, qui: true, sex: true, sab: true, dom: false },
  linhas: [{ professional: { id: 'p1', nome: 'Camila Rocha', especialidade: 'Unhas' }, celulas: celulas(42) }],
  media: celulas(42),
  insight: { texto: 'Terça de manhã está com 42% de ocupação. Que tal uma campanha para clientes que não vêm há mais de 30 dias?', dia: 'ter', turno: 'manha', ocupacao: 42 },
  pico: { rotulo: 'Sábado à tarde', ocupacao: 97 },
  ...over,
});

const evolucao: Evolucao = {
  meses: ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].map((mes, i) => ({
    mes, servicos: 20000 + i * 1000, produtos: 4000, total: 24000 + i * 1000, meta: 38000, atual: i === 5, projecao: i === 5 ? 38450 : null,
  })),
};

beforeEach(() => {
  vi.clearAllMocks();
  api.visaoGeral.mockResolvedValue(visao());
  api.ocupacao.mockResolvedValue(ocupacao());
  api.evolucao.mockResolvedValue(evolucao);
});

describe('Relatórios', () => {
  it('indicadores com dado real e comparação', async () => {
    render(<RelatoriosModule />);
    expect(await screen.findByText(/R\$\s*132,50/)).toBeInTheDocument();
    expect(screen.getByText('+8,4%')).toBeInTheDocument();
    expect(screen.getByText('72%')).toBeInTheDocument();
    expect(screen.getByText('2,8%')).toBeInTheDocument();
    expect(screen.getByText('Sinal Pix + lembrete ativo')).toBeInTheDocument();
    expect(screen.getByText('90% atingido')).toBeInTheDocument();
  });

  it('origem, mapa, insight e rodapé', async () => {
    render(<RelatoriosModule />);
    expect(await screen.findByText('Hora de voltar e campanhas')).toBeInTheDocument();
    expect(screen.getByText('148 · 44%')).toBeInTheDocument();
    expect(screen.getAllByText('Fechado').length).toBeGreaterThan(0);
    expect(screen.getByText(/Terça de manhã está com 42%/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Criar campanha' })).toHaveAttribute('href', '/whatsapp?aba=campanhas');
    expect(screen.getByText('Sábado à tarde, com 97% da capacidade')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Faturamento dos últimos 6 meses' })).toBeInTheDocument();
  });

  it('sem dados: "—", poucos dados, sem meta e sem insight', async () => {
    api.visaoGeral.mockResolvedValue({
      ...visao({
        ticketMedio: { valor: null, anterior: null, variacao: null },
        retornoNoCiclo: { valor: null, base: 1, variacao: null },
        faltas: { valor: null, variacao: null, sinalPix: false, lembretes: true },
        faturamentoMes: { valor: 0, meta: null, percentual: null },
      }),
      origem: { total: 0, itens: [] },
    });
    api.ocupacao.mockResolvedValue(ocupacao({ insight: null, pico: null }));
    api.evolucao.mockResolvedValue({ meses: [] });
    render(<RelatoriosModule />);
    expect(await screen.findByText('Poucos dados ainda')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Definir meta' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ative o sinal Pix para reduzir faltas' })).toBeInTheDocument();
    expect(screen.getByText('Nenhum agendamento neste período.')).toBeInTheDocument();
    expect(screen.queryByText(/Que tal uma campanha/)).not.toBeInTheDocument();
    expect(await screen.findByText('Ainda não há comandas fechadas nos últimos 6 meses.')).toBeInTheDocument();
  });
});

describe('períodos', () => {
  it('quinzenas e rótulos', () => {
    expect(quinzenaDe('2026-02-20')).toEqual({ inicio: '2026-02-16', fim: '2026-02-28' });
    expect(quinzenaVizinha({ inicio: '2026-10-01', fim: '2026-10-15' }, -1)).toEqual({ inicio: '2026-09-16', fim: '2026-09-30' });
    expect(quinzenaVizinha({ inicio: '2026-10-16', fim: '2026-10-31' }, 1)).toEqual({ inicio: '2026-11-01', fim: '2026-11-15' });
    expect(rotuloPeriodo({ inicio: '2026-09-01', fim: '2026-09-15' })).toBe('1 a 15 de setembro de 2026');
    expect(rotuloPeriodo({ inicio: '2026-08-18', fim: '2026-09-17' })).toBe('18 de agosto a 17 de setembro de 2026');
  });
});
