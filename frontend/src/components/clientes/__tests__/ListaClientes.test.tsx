import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { ClienteInsight, InsightsDto } from '@/lib/crm';

const mockPush = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

const mockBuscarInsights = vi.hoisted(() => vi.fn());
const mockExportar = vi.hoisted(() => vi.fn());
vi.mock('@/lib/crm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/crm')>()),
  buscarInsights: (...args: unknown[]) => mockBuscarInsights(...args),
  exportarClientesCsv: (...args: unknown[]) => mockExportar(...args),
}));
vi.mock('@/lib/tags', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tags')>()),
  listarEtiquetas: vi.fn().mockResolvedValue([{ id: 't1', name: 'Clube VIP', color: 'brand', clientes: 3 }]),
  definirEtiquetasCliente: vi.fn().mockResolvedValue([]),
}));
vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: [{ id: 'p1', name: 'Camila' }] }),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

const { ListaClientes } = await import('../ListaClientes');

const cliente = (partes: Partial<ClienteInsight> & { id: string; name: string }): ClienteInsight => ({
  phone: '11987412039',
  email: null,
  birthDate: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  active: true,
  tags: [],
  consentimento: 'nao_informado',
  fase: 'recorrente',
  etiquetasAuto: [],
  ultimaVisita: { date: '2026-09-17', receita: 120, servico: 'Manutenção', profissional: 'Camila', diasAtras: 0 },
  cicloMedio: 21,
  retornoPrevisto: { data: '2026-10-08', venceuHa: null, texto: '08/10 · em 21 dias' },
  ltv: 1820,
  atendimentos: 14,
  ...partes,
});

const resposta = (itens: ClienteInsight[], total = itens.length): InsightsDto => ({
  itens,
  total,
  contagemPorFase: { todas: 248, novo: 24, recorrente: 88, fiel: 65, em_risco: 42, perdido: 29 },
});

const ultimaChamada = () => mockBuscarInsights.mock.calls[mockBuscarInsights.mock.calls.length - 1][0];

const renderizar = () =>
  render(<ListaClientes nomeNegocio="Studio Aurora" onNovaCliente={vi.fn()} onEditar={vi.fn()} />);

describe('ListaClientes', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockExportar.mockReset();
    mockExportar.mockResolvedValue(undefined);
    mockBuscarInsights.mockReset();
    mockBuscarInsights.mockResolvedValue(resposta([cliente({ id: 'c1', name: 'Mariana Souza' })]));
  });

  it('mostra as abas de fase com a contagem de cada uma', async () => {
    renderizar();
    const abas = await screen.findByRole('tablist', { name: 'Fases' });
    await waitFor(() => expect(within(abas).getByRole('tab', { name: 'Todas 248' })).toBeInTheDocument());
    expect(within(abas).getByRole('tab', { name: 'Novo 24' })).toBeInTheDocument();
    expect(within(abas).getByRole('tab', { name: 'Recorrente 88' })).toBeInTheDocument();
    expect(within(abas).getByRole('tab', { name: 'Fiel 65' })).toBeInTheDocument();
    expect(within(abas).getByRole('tab', { name: 'Em risco 42' })).toBeInTheDocument();
    expect(within(abas).getByRole('tab', { name: 'Perdido 29' })).toBeInTheDocument();
  });

  it('clicar na aba "Em risco" busca só essa fase', async () => {
    renderizar();
    fireEvent.click(await screen.findByRole('tab', { name: 'Em risco 42' }));
    await waitFor(() => expect(ultimaChamada()).toEqual(expect.objectContaining({ fase: 'em_risco', page: 1 })));
  });

  it('a busca espera a digitação parar antes de pedir de novo', async () => {
    renderizar();
    await screen.findAllByText('Mariana Souza');
    const chamadasAntes = mockBuscarInsights.mock.calls.length;

    fireEvent.change(screen.getByPlaceholderText('Buscar por nome, telefone ou e-mail'), { target: { value: 'mari' } });
    // Logo após digitar ainda não pediu nada.
    expect(mockBuscarInsights.mock.calls.length).toBe(chamadasAntes);

    await waitFor(() => expect(ultimaChamada()).toEqual(expect.objectContaining({ busca: 'mari' })));
  });

  it('ordenar por "Maior LTV" pede ordem ltv', async () => {
    renderizar();
    await screen.findAllByText('Mariana Souza');
    fireEvent.change(screen.getByLabelText('Ordenar por'), { target: { value: 'ltv' } });
    await waitFor(() => expect(ultimaChamada()).toEqual(expect.objectContaining({ ordem: 'ltv' })));
    expect(screen.getByRole('option', { name: 'Maior LTV' })).toBeInTheDocument();
  });

  it('"Exportar" baixa o CSV de clientes', async () => {
    renderizar();
    fireEvent.click(await screen.findByRole('button', { name: /Exportar/ }));
    await waitFor(() => expect(mockExportar).toHaveBeenCalledTimes(1));
  });

  it('retorno vencido aparece em danger com o ícone de aviso', async () => {
    mockBuscarInsights.mockResolvedValue(
      resposta([
        cliente({
          id: 'c2',
          name: 'Beatriz Costa',
          fase: 'em_risco',
          retornoPrevisto: { data: '2026-08-26', venceuHa: 22, texto: 'Venceu há 22 dias' },
        }),
      ]),
    );
    renderizar();
    const linha = await screen.findByRole('row', { name: 'Ver ficha de Beatriz Costa' });
    const texto = within(linha).getByText('Venceu há 22 dias');
    const destaque = texto.closest('.text-danger');
    expect(destaque).not.toBeNull();
    expect(within(destaque as HTMLElement).getByText('warning')).toBeInTheDocument();
  });

  it('botão do WhatsApp fica desabilitado para cliente sem telefone', async () => {
    mockBuscarInsights.mockResolvedValue(resposta([cliente({ id: 'c3', name: 'Sem Fone', phone: '' })]));
    renderizar();
    await screen.findAllByText('Sem Fone');
    const botoes = screen.getAllByRole('button', { name: 'WhatsApp de Sem Fone' });
    expect(botoes).toHaveLength(2); // tabela e cartão
    botoes.forEach((b) => expect(b).toBeDisabled());
  });

  it('WhatsApp de cliente com retorno vencido abre a mensagem de retorno', async () => {
    mockBuscarInsights.mockResolvedValue(
      resposta([
        cliente({
          id: 'c2',
          name: 'Beatriz Costa',
          retornoPrevisto: { data: '2026-08-26', venceuHa: 22, texto: 'Venceu há 22 dias' },
        }),
      ]),
    );
    renderizar();
    const linha = await screen.findByRole('row', { name: 'Ver ficha de Beatriz Costa' });
    fireEvent.click(within(linha).getByRole('button', { name: 'WhatsApp de Beatriz Costa' }));
    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getByRole('textbox')).toHaveValue(
      'Oi, Beatriz! Já está na hora de renovar o seu Manutenção aqui no Studio Aurora. Quer que eu veja um horário para você?',
    );
  });

  it('a paginação pede a página 2', async () => {
    mockBuscarInsights.mockResolvedValue(
      resposta(Array.from({ length: 10 }, (_, i) => cliente({ id: `c${i}`, name: `Cliente ${i}` })), 25),
    );
    renderizar();
    await screen.findAllByText('Cliente 0');
    expect(screen.getByText(/Mostrando/).textContent?.replace(/\s+/g, ' ')).toContain('Mostrando 1–10 de 25 clientes');
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    await waitFor(() => expect(ultimaChamada()).toEqual(expect.objectContaining({ page: 2 })));
  });

  it('clicar na linha abre a ficha da cliente', async () => {
    renderizar();
    const linha = await screen.findByRole('row', { name: 'Ver ficha de Mariana Souza' });
    fireEvent.click(linha);
    expect(mockPush).toHaveBeenCalledWith('/clientes/c1');
  });

  it('agendar leva ao novo agendamento já com a cliente', async () => {
    renderizar();
    const linha = await screen.findByRole('row', { name: 'Ver ficha de Mariana Souza' });
    const link = within(linha).getByRole('link', { name: 'Agendar para Mariana Souza' });
    expect(link).toHaveAttribute('href', '/agendamentos?novo=1&cliente=c1');
  });

  it('mostra a linha com dados reais: fase, última visita, ciclo, LTV e etiquetas', async () => {
    mockBuscarInsights.mockResolvedValue(
      resposta([
        cliente({
          id: 'c1',
          name: 'Mariana Souza',
          fase: 'fiel',
          tags: [{ id: 't1', name: 'Clube VIP', color: 'brand' }],
          etiquetasAuto: ['Aniversário no mês'],
        }),
      ]),
    );
    renderizar();
    const linha = await screen.findByRole('row', { name: 'Ver ficha de Mariana Souza' });
    expect(within(linha).getByText('(11) 98741-2039')).toBeInTheDocument();
    expect(within(linha).getByText('Fiel / VIP')).toBeInTheDocument();
    expect(within(linha).getByText('Clube VIP')).toHaveClass('text-brand-text');
    expect(within(linha).getByText('Aniversário no mês')).toHaveClass('text-muted');
    expect(within(linha).getByText('17 set')).toBeInTheDocument();
    expect(within(linha).getByText('Manutenção · Camila')).toBeInTheDocument();
    expect(within(linha).getByText('21 dias')).toBeInTheDocument();
    expect(within(linha).getByText('R$ 1.820,00')).toBeInTheDocument();
    expect(within(linha).getByText('14 atendimentos')).toBeInTheDocument();
  });

  it('sem nenhuma cliente cadastrada mostra o vazio com "+ Nova cliente"', async () => {
    mockBuscarInsights.mockResolvedValue({
      itens: [],
      total: 0,
      contagemPorFase: { todas: 0, novo: 0, recorrente: 0, fiel: 0, em_risco: 0, perdido: 0 },
    });
    const onNovaCliente = vi.fn();
    render(<ListaClientes nomeNegocio="Studio Aurora" onNovaCliente={onNovaCliente} onEditar={vi.fn()} />);
    expect(await screen.findByText('Nenhuma cliente cadastrada')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Nova cliente/ }));
    expect(onNovaCliente).toHaveBeenCalled();
  });

  it('com filtro e nada encontrado mostra o vazio de filtro', async () => {
    renderizar();
    await screen.findAllByText('Mariana Souza');
    mockBuscarInsights.mockResolvedValue({
      itens: [],
      total: 0,
      contagemPorFase: { todas: 0, novo: 0, recorrente: 0, fiel: 0, em_risco: 0, perdido: 0 },
    });
    fireEvent.change(screen.getByPlaceholderText('Buscar por nome, telefone ou e-mail'), { target: { value: 'zzz' } });
    expect(await screen.findByText('Nenhuma cliente encontrada com esses filtros')).toBeInTheDocument();
  });
  it('no celular mostra cartões com fase, etiquetas, visita, retorno, LTV e ações', async () => {
    mockBuscarInsights.mockResolvedValue(
      resposta([
        cliente({
          id: 'c2',
          name: 'Beatriz Costa',
          fase: 'em_risco',
          tags: [{ id: 't1', name: 'Clube VIP', color: 'brand' }],
          etiquetasAuto: ['Resgatável'],
          retornoPrevisto: { data: '2026-08-26', venceuHa: 22, texto: 'Venceu há 22 dias' },
        }),
      ]),
    );
    renderizar();
    const cartoes = await screen.findByTestId('cartoes-clientes');
    const cartao = within(cartoes).getByRole('button', { name: 'Ver ficha de Beatriz Costa' });
    expect(within(cartao).getByText('(11) 98741-2039')).toBeInTheDocument();
    expect(within(cartao).getByText('Em risco')).toBeInTheDocument();
    expect(within(cartao).getByText('Clube VIP')).toHaveClass('text-brand-text');
    expect(within(cartao).getByText('Resgatável')).toHaveClass('text-muted');
    expect(within(cartao).getByText('Manutenção · Camila')).toBeInTheDocument();
    expect(within(cartao).getByText('Venceu há 22 dias').closest('.text-danger')).not.toBeNull();
    expect(within(cartao).getByText('R$ 1.820,00')).toBeInTheDocument();
    expect(within(cartao).getByText('14 atendimentos')).toBeInTheDocument();
    expect(within(cartao).getByRole('button', { name: 'WhatsApp de Beatriz Costa' })).toBeEnabled();
    expect(within(cartao).getByRole('link', { name: 'Agendar para Beatriz Costa' })).toHaveAttribute(
      'href',
      '/agendamentos?novo=1&cliente=c2',
    );
    expect(within(cartao).getByRole('button', { name: 'Mais opções de Beatriz Costa' })).toBeInTheDocument();

    // A tabela fica escondida abaixo de lg; os cartões, a partir de lg.
    expect(cartoes).toHaveClass('lg:hidden');
    expect(screen.getByRole('table').parentElement).toHaveClass('hidden', 'lg:block');

    fireEvent.click(cartao);
    expect(mockPush).toHaveBeenCalledWith('/clientes/c2');
  });

  it('ignora a resposta de um pedido antigo que chega depois do novo', async () => {
    let resolverAntigo: (v: InsightsDto) => void = () => {};
    mockBuscarInsights.mockReset();
    mockBuscarInsights
      .mockImplementationOnce(() => new Promise<InsightsDto>((r) => { resolverAntigo = r; }))
      .mockImplementationOnce(() => Promise.resolve(resposta([cliente({ id: 'n1', name: 'Nova Resposta' })])));
    renderizar();
    fireEvent.click(await screen.findByRole('tab', { name: /Em risco/ }));
    await screen.findAllByText('Nova Resposta');

    resolverAntigo(resposta([cliente({ id: 'v1', name: 'Velha Resposta' })]));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('Velha Resposta')).not.toBeInTheDocument();
    expect(screen.getAllByText('Nova Resposta').length).toBeGreaterThan(0);
  });

  it('erro sem dados mostra o estado de erro com "Tentar de novo"', async () => {
    mockBuscarInsights.mockReset();
    mockBuscarInsights.mockRejectedValueOnce(new Error('falhou'));
    mockBuscarInsights.mockResolvedValue(resposta([cliente({ id: 'c1', name: 'Mariana Souza' })]));
    renderizar();
    expect(await screen.findByText('Não foi possível carregar as clientes')).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma cliente cadastrada')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('row', { name: 'Ver ficha de Mariana Souza' })).toBeInTheDocument();
  });
});
