import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { ClienteInsight, Fase, FasesDto } from '@/lib/crm';

const mockPush = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
}));

const mockBuscarFases = vi.hoisted(() => vi.fn());
vi.mock('@/lib/crm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/crm')>()),
  buscarFases: (...args: unknown[]) => mockBuscarFases(...args),
}));

const { FasesClientes } = await import('../FasesClientes');

const cliente = (fase: Fase, id: string, name: string, extra: Partial<ClienteInsight> = {}): ClienteInsight => ({
  id, name, phone: '11987412039', email: null, birthDate: null, createdAt: '2026-01-01T00:00:00.000Z', active: true,
  tags: [], consentimento: 'nao_informado', fase, etiquetasAuto: [],
  ultimaVisita: { date: '2026-09-17', receita: 120, servico: 'Manutenção', profissional: 'Camila', diasAtras: 3 },
  cicloMedio: 21, retornoPrevisto: { data: null, venceuHa: null, texto: '—' }, ltv: 1820, atendimentos: 14,
  avatarUrl: null,
  ...extra,
});

const ROTULOS: Record<Fase, string> = { novo: 'Novo', recorrente: 'Recorrente', fiel: 'Fiel / VIP', em_risco: 'Em risco', perdido: 'Perdido' };
const dto = (cartoes: Partial<Record<Fase, ClienteInsight[]>> = {}, kpis: Partial<FasesDto['kpis']> = {}): FasesDto => ({
  colunas: (['novo', 'recorrente', 'fiel', 'em_risco', 'perdido'] as Fase[]).map((fase) => ({
    fase, rotulo: ROTULOS[fase], contagem: (cartoes[fase] ?? []).length, ltvTotal: (cartoes[fase] ?? []).length * 1000, cartoes: cartoes[fase] ?? [],
  })),
  kpis: { ativas: 248, ativasNovasNoMes: 12, ltvMedio: 1500, retencao: 82, ...kpis },
});

describe('FasesClientes', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockBuscarFases.mockReset();
  });

  it('mostra os KPIs e cinco colunas na ordem, com contagem', async () => {
    mockBuscarFases.mockResolvedValue(dto({ novo: [cliente('novo', 'a', 'Ana Lima')], fiel: [cliente('fiel', 'b', 'Bia Reis'), cliente('fiel', 'c', 'Cris Dias')] }));
    render(<FasesClientes nomeNegocio="Studio Aurora" />);
    await screen.findByText('Ana Lima');
    expect(screen.getByText('+12 este mês')).toBeInTheDocument();
    expect(screen.getByText('82%')).toBeInTheDocument();
    const titulos = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titulos.map((t) => t?.replace(/\d+$/, ''))).toEqual(['Novo', 'Recorrente', 'Fiel / VIP', 'Em risco', 'Perdido']);
    const fiel = screen.getByRole('region', { name: 'Fiel / VIP' });
    expect(within(fiel).getByText('2 clientes · R$ 2.000,00')).toBeInTheDocument();
    expect(within(fiel).getByText('5 ou mais atendimentos com ciclo regular')).toBeInTheDocument();
  });

  it('cada fase tem o botão da fase', async () => {
    mockBuscarFases.mockResolvedValue(dto({
      novo: [cliente('novo', 'a', 'Ana')], recorrente: [cliente('recorrente', 'b', 'Bia')], fiel: [cliente('fiel', 'c', 'Cris')],
      em_risco: [cliente('em_risco', 'd', 'Dani')], perdido: [cliente('perdido', 'e', 'Eva')],
    }));
    render(<FasesClientes />);
    await screen.findByText('Ana');
    expect(screen.getByRole('button', { name: 'Pós-atendimento WhatsApp' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Agendar retorno' })).toHaveAttribute('href', '/agendamentos?novo=1&cliente=b');
    expect(screen.getByRole('button', { name: 'Enviar mimo no WhatsApp' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resgatar no WhatsApp' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Campanha de resgate' })).toBeInTheDocument();
  });

  it('o WhatsApp abre o modal com a mensagem da fase', async () => {
    mockBuscarFases.mockResolvedValue(dto({ em_risco: [cliente('em_risco', 'd', 'Dani Alves')] }));
    render(<FasesClientes nomeNegocio="Studio Aurora" />);
    await screen.findByText('Dani Alves');
    fireEvent.click(screen.getByRole('button', { name: 'Resgatar no WhatsApp' }));
    expect(await screen.findByText('Mensagem para Dani Alves')).toBeInTheDocument();
    expect(screen.getByDisplayValue(/Sentimos sua falta no Studio Aurora/)).toBeInTheDocument();
  });

  it('sem telefone o botão de WhatsApp fica desabilitado', async () => {
    mockBuscarFases.mockResolvedValue(dto({ fiel: [cliente('fiel', 'c', 'Cris', { phone: '' })] }));
    render(<FasesClientes />);
    await screen.findByText('Cris');
    expect(screen.getByRole('button', { name: 'Enviar mimo no WhatsApp' })).toBeDisabled();
  });

  it('o cartão abre a ficha', async () => {
    mockBuscarFases.mockResolvedValue(dto({ novo: [cliente('novo', 'a', 'Ana Lima')] }));
    render(<FasesClientes />);
    fireEvent.click(await screen.findByText('Ana Lima'));
    expect(mockPush).toHaveBeenCalledWith('/clientes/a');
  });

  it('retenção null mostra "—"', async () => {
    mockBuscarFases.mockResolvedValue(dto({}, { retencao: null }));
    render(<FasesClientes />);
    const kpi = (await screen.findByText('Taxa de retenção')).parentElement as HTMLElement;
    expect(within(kpi).getByText('—')).toBeInTheDocument();
  });

  it('coluna vazia mostra a frase', async () => {
    mockBuscarFases.mockResolvedValue(dto({ novo: [cliente('novo', 'a', 'Ana')] }));
    render(<FasesClientes />);
    await screen.findByText('Ana');
    expect(screen.getAllByText('Nenhuma cliente nesta fase')).toHaveLength(4);
  });

  it('erro mostra estado de erro e tenta de novo', async () => {
    mockBuscarFases.mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(dto({ novo: [cliente('novo', 'a', 'Ana')] }));
    render(<FasesClientes />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
  });

  it('o cartão mostra a foto da cliente ou as iniciais', async () => {
    mockBuscarFases.mockResolvedValue(dto({
      novo: [cliente('novo', 'a', 'Ana Lima', { avatarUrl: 'https://cdn.exemplo/ana.jpg' }), cliente('novo', 'b', 'Bia Reis')],
    }));
    render(<FasesClientes nomeNegocio="Studio Aurora" />);
    expect(await screen.findByRole('img', { name: 'Ana Lima' })).toHaveAttribute('src', 'https://cdn.exemplo/ana.jpg');
    expect(screen.getByRole('img', { name: 'Bia Reis' })).toHaveTextContent('BR');
  });
});
