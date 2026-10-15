import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { Client } from '@/types';
import type { ClienteInsight } from '@/lib/crm';

const mockPush = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { businessName: 'Studio Aurora' } }),
}));

const mockApiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

const mockBuscarInsights = vi.hoisted(() => vi.fn());
vi.mock('@/lib/crm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/crm')>()),
  buscarInsights: (...args: unknown[]) => mockBuscarInsights(...args),
  buscarFases: vi.fn().mockResolvedValue({
    colunas: ['novo', 'recorrente', 'fiel', 'em_risco', 'perdido'].map((fase) => ({ fase, rotulo: fase, contagem: 0, ltvTotal: 0, cartoes: [] })),
    kpis: { ativas: 0, ativasNovasNoMes: 0, ltvMedio: null, retencao: null },
  }),
}));
vi.mock('@/lib/tags', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tags')>()),
  listarEtiquetas: vi.fn().mockResolvedValue([]),
}));

const { ClientModule } = await import('../ClientModule');

const insight: ClienteInsight = {
  id: 'c1', name: 'Maria Silva', phone: '11999999999', email: null, birthDate: null,
  createdAt: '2024-01-01T00:00:00.000Z', active: true, tags: [], consentimento: 'nao_informado',
  fase: 'novo', etiquetasAuto: [], ultimaVisita: null, cicloMedio: null,
  retornoPrevisto: { data: null, venceuHa: null, texto: '—' }, ltv: 0, atendimentos: 0,
};

const completo: Client = {
  id: 'c1', business_id: 'b1', name: 'Maria Silva', phone: '11999999999',
  last_visit: null, total_spent: 0, created_at: '2024-01-01T00:00:00.000Z',
  address: 'Rua A, 10', notes: 'Prefere manhã',
};

describe('ClientModule', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockApiGet.mockReset();
    mockApiGet.mockImplementation((url: string) =>
      Promise.resolve({ data: url === '/clients' ? [completo] : [] }),
    );
    mockBuscarInsights.mockReset();
    mockBuscarInsights.mockResolvedValue({
      itens: [insight], total: 1,
      contagemPorFase: { todas: 3, novo: 1, recorrente: 1, fiel: 1, em_risco: 0, perdido: 0 },
    });
  });

  it('mostra o cabeçalho com o total de clientes cadastradas e o alternador Lista/Fases', async () => {
    render(<ClientModule />);
    expect(screen.getByRole('heading', { name: 'Clientes' })).toBeInTheDocument();
    expect(await screen.findByText('3 clientes cadastradas')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Lista/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Fases/ })).toBeInTheDocument();
  });

  it('a linha da lista abre a ficha em /clientes/<id>, sem painel lateral', async () => {
    render(<ClientModule />);
    fireEvent.click(await screen.findByRole('row', { name: 'Ver ficha de Maria Silva' }));
    expect(mockPush).toHaveBeenCalledWith('/clientes/c1');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('"Nova cliente" abre o cadastro', async () => {
    render(<ClientModule />);
    await screen.findByRole('row', { name: 'Ver ficha de Maria Silva' });
    fireEvent.click(screen.getByRole('button', { name: 'Nova cliente' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('"Editar" no menu abre o cadastro completo (com endereço e observações)', async () => {
    render(<ClientModule />);
    const linha = await screen.findByRole('row', { name: 'Ver ficha de Maria Silva' });
    const menu = within(linha).getByRole('button', { name: 'Mais opções de Maria Silva' });
    fireEvent.pointerDown(menu, { button: 0, ctrlKey: false, pointerType: 'mouse' });
    fireEvent.click(await screen.findByRole('menuitem', { name: /Editar/ }));
    await waitFor(() => expect(mockApiGet).toHaveBeenCalledWith('/clients'));
    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toBeInTheDocument();
    expect(screen.getByDisplayValue('Rua A, 10')).toBeInTheDocument();
  });

  it('não usa mais dado de exemplo: sem fase/serviço inventados', async () => {
    render(<ClientModule />);
    await screen.findByRole('row', { name: 'Ver ficha de Maria Silva' });
    expect(screen.queryByText('Corte e finalização · Camila')).not.toBeInTheDocument();
    expect(mockApiGet).not.toHaveBeenCalledWith('/clients');
  });

  it('atalho "/" foca a busca quando o foco não está em campo de texto', async () => {
    render(<ClientModule />);
    await screen.findByRole('row', { name: 'Ver ficha de Maria Silva' });
    const busca = screen.getByPlaceholderText('Buscar por nome, telefone ou e-mail');
    fireEvent.keyDown(window, { key: '/' });
    expect(busca).toHaveFocus();
  });

  it('alternar para Fases troca a lista pela visão por fases', async () => {
    render(<ClientModule />);
    await screen.findByRole('row', { name: 'Ver ficha de Maria Silva' });
    fireEvent.click(screen.getByRole('tab', { name: /Fases/ }));
    await waitFor(() => expect(screen.queryByRole('row', { name: 'Ver ficha de Maria Silva' })).not.toBeInTheDocument());
    expect(await screen.findByText('Taxa de retenção')).toBeInTheDocument();
  });
});
