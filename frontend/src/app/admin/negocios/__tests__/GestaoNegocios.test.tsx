import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import type { ListaNegocios, NegocioListado } from '@/types/admin';

const adminApi = vi.hoisted(() => ({ getTenants: vi.fn(), exportTenantsCsv: vi.fn() }));
const replace = vi.hoisted(() => vi.fn());
const busca = vi.hoisted(() => ({ atual: new URLSearchParams() }));

vi.mock('@/lib/adminApi', () => ({ adminApi }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => busca.atual,
}));

const { default: AdminNegociosPage } = await import('../page');

const negocio = (extra: Partial<NegocioListado> = {}): NegocioListado => ({
  id: 'n1',
  nome: 'Studio Aurora',
  dono: 'Carla Silva',
  email: 'carla@aurora.com',
  whatsapp: '11987654321',
  endereco: 'Rua das Flores, 10 - Campina Grande, PB',
  segmento: 'unhas',
  plano: 'profissional',
  preco: 99.9,
  status: 'ativo',
  whatsappConectado: true,
  whatsappConectadoEm: '2026-10-01T12:00:00.000Z',
  agendamentos30d: 246,
  ultimaAtividadeEm: null,
  diasRestantesTeste: null,
  ...extra,
});

const lista = (extra: Partial<ListaNegocios> = {}): ListaNegocios => ({
  data: [
    negocio(),
    negocio({
      id: 'n2',
      nome: 'Bellas Esmalteria',
      dono: 'Juliana Mendes',
      endereco: null,
      plano: 'basico',
      preco: 49.9,
      status: 'teste',
      whatsappConectado: false,
      diasRestantesTeste: 3,
      agendamentos30d: 12,
    }),
  ],
  meta: { total: 2, page: 1, limit: 20, totalPages: 1 },
  cartoes: {
    base: 30,
    pagantes: 12,
    mrr: 1198.8,
    ticketMedio: 99.9,
    testes: 9,
    testesVencemHoje: 2,
    conversaoPct: 28.6,
    inadimplentes: 4,
    valorPendente: 384,
    bloqueioTotal: 1,
  },
  segmentos: [
    { segmento: 'barbearia', total: 10 },
    { segmento: 'unhas', total: 8 },
  ],
  ...extra,
});

const ultimaChamada = () => adminApi.getTenants.mock.calls.at(-1)?.[0];

beforeEach(() => {
  vi.clearAllMocks();
  busca.atual = new URLSearchParams();
  adminApi.getTenants.mockResolvedValue(lista());
  adminApi.exportTenantsCsv.mockResolvedValue(new Blob(['a;b'], { type: 'text/csv' }));
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Gestão de negócios', () => {
  it('carrega a lista e os cartões', async () => {
    render(<AdminNegociosPage />);
    expect(await screen.findByText('Studio Aurora')).toBeInTheDocument();
    expect(adminApi.getTenants).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(screen.getByText('R$ 384,00 pendente')).toBeInTheDocument();
    expect(screen.getByText('1 em bloqueio total')).toBeInTheDocument();
    expect(screen.getByText('2 vencem hoje')).toBeInTheDocument();
    expect(screen.getByText('Conversão média de 28,6%')).toBeInTheDocument();
    expect(screen.getByText('Exibindo 1–2 de 2 negócios')).toBeInTheDocument();
  });

  it('clicar na pílula "Unhas" filtra pelo segmento e volta à página 1', async () => {
    busca.atual = new URLSearchParams('page=3');
    render(<AdminNegociosPage />);
    await screen.findByText('Studio Aurora');
    fireEvent.click(screen.getByRole('button', { name: /^Unhas/ }));
    await waitFor(() => expect(ultimaChamada()).toEqual(expect.objectContaining({ segmento: 'unhas', page: 1 })));
    expect(replace).toHaveBeenLastCalledWith('/admin/negocios?segmento=unhas', { scroll: false });
  });

  it('escolher "Em carência" filtra pelo status', async () => {
    render(<AdminNegociosPage />);
    await screen.findByText('Studio Aurora');
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'carencia' } });
    await waitFor(() => expect(ultimaChamada()).toEqual(expect.objectContaining({ status: 'carencia', page: 1 })));
  });

  it('o status da URL vale desde a primeira carga (redirecionamento de assinaturas)', async () => {
    busca.atual = new URLSearchParams('status=carencia');
    render(<AdminNegociosPage />);
    await screen.findByText('Studio Aurora');
    expect(adminApi.getTenants).toHaveBeenCalledTimes(1);
    expect(adminApi.getTenants).toHaveBeenCalledWith({ status: 'carencia', page: 1, limit: 20 });
    expect(screen.getByLabelText('Status')).toHaveValue('carencia');
  });

  it('a busca espera 300 ms antes de consultar', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<AdminNegociosPage />);
    await screen.findByText('Studio Aurora');
    const campo = screen.getByPlaceholderText('Buscar por nome, e-mail, WhatsApp ou CPF/CNPJ');
    fireEvent.change(campo, { target: { value: 'aur' } });
    act(() => vi.advanceTimersByTime(200));
    expect(adminApi.getTenants).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(150));
    await waitFor(() => expect(ultimaChamada()).toEqual(expect.objectContaining({ busca: 'aur', page: 1 })));
  });

  it('a linha de teste mostra os dias restantes e o plano com valor', async () => {
    render(<AdminNegociosPage />);
    const linha = (await screen.findByText('Bellas Esmalteria')).closest('tr') as HTMLElement;
    expect(within(linha).getByText('3 dias restantes')).toBeInTheDocument();
    expect(within(linha).getByText('Solo · R$ 49,90/mês')).toBeInTheDocument();
    expect(within(linha).getByText('Desconectado')).toBeInTheDocument();
    expect(within(linha).getByRole('link', { name: 'Ver detalhes' })).toHaveAttribute('href', '/admin/negocios/n2');
  });

  it('sem endereço, nenhuma cidade aparece', async () => {
    render(<AdminNegociosPage />);
    const semEndereco = (await screen.findByText('Bellas Esmalteria')).closest('tr') as HTMLElement;
    expect(within(semEndereco).queryByText(/Campina Grande/)).not.toBeInTheDocument();
    expect(within(semEndereco).queryByText('location_on')).not.toBeInTheDocument();
    const comEndereco = screen.getByText('Studio Aurora').closest('tr') as HTMLElement;
    expect(within(comEndereco).getByText('Rua das Flores, 10 - Campina Grande, PB')).toBeInTheDocument();
  });

  it('"Exportar CSV" baixa com os filtros atuais', async () => {
    const clique = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    busca.atual = new URLSearchParams('status=carencia&plano=premium&page=2');
    render(<AdminNegociosPage />);
    await screen.findByText('Studio Aurora');
    fireEvent.click(screen.getByRole('button', { name: /Exportar CSV/ }));
    await waitFor(() =>
      expect(adminApi.exportTenantsCsv).toHaveBeenCalledWith({ status: 'carencia', plano: 'premium' }),
    );
    await waitFor(() => expect(clique).toHaveBeenCalled());
    clique.mockRestore();
  });

  it('próxima página e itens por página mudam a consulta', async () => {
    adminApi.getTenants.mockResolvedValue(lista({ meta: { total: 45, page: 1, limit: 20, totalPages: 3 } }));
    render(<AdminNegociosPage />);
    await screen.findByText('Exibindo 1–20 de 45 negócios');
    fireEvent.click(screen.getByRole('button', { name: 'Próxima página' }));
    await waitFor(() => expect(ultimaChamada()).toEqual({ page: 2, limit: 20 }));
    fireEvent.change(screen.getByLabelText('Itens por página'), { target: { value: '50' } });
    await waitFor(() => expect(ultimaChamada()).toEqual({ page: 1, limit: 50 }));
  });

  it('não mostra os blocos tirados do Stitch', async () => {
    render(<AdminNegociosPage />);
    await screen.findByText('Studio Aurora');
    expect(screen.queryByText(/Novo negócio manual/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Instável/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Latência/)).not.toBeInTheDocument();
  });

  it('sem cartões no envelope, a tela abre mesmo assim', async () => {
    adminApi.getTenants.mockResolvedValue({ ...lista(), cartoes: null });
    render(<AdminNegociosPage />);
    expect(await screen.findByText('Studio Aurora')).toBeInTheDocument();
    expect(screen.queryByText(/em bloqueio total/)).not.toBeInTheDocument();
  });
});
