import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ conexoes: vi.fn() }));
vi.mock('@/lib/recebimentos', async (orig) => ({ ...(await orig<typeof import('@/lib/recebimentos')>()), recebimentosApi: api }));
const usuario = vi.hoisted(() => ({ atual: { role: 'tenant_admin' } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: usuario.atual }) }));
vi.mock('@/components/recebimentos/PixManualCard', () => ({ PixManualCard: () => <p>Cartão do Pix manual</p> }));

const { RecebimentosSection } = await import('../RecebimentosSection');

const conexao = {
  gateway: 'mercadopago', situacao: 'ativa', contaNome: 'Barbearia Ana', aceitaPix: true, aceitaCartao: false,
  aceiteCartaoEm: null, ultimaConfirmacaoEm: null, reservasPendentes: 0,
};

describe('RecebimentosSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usuario.atual = { role: 'tenant_admin' };
  });

  it('não renderiza para quem não é tenant_admin', () => {
    usuario.atual = { role: 'professional' };
    const { container } = render(<RecebimentosSection />);
    expect(container).toBeEmptyDOMElement();
    expect(api.conexoes).not.toHaveBeenCalled();
  });

  it('com configurado false mostra só a chave Pix, sem gateways', async () => {
    api.conexoes.mockResolvedValue({ configurado: false, conexao: null });
    render(<RecebimentosSection />);
    expect(screen.getByText('Cartão do Pix manual')).toBeInTheDocument();
    await waitFor(() => expect(api.conexoes).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText(/carregando recebimentos/i)).not.toBeInTheDocument());
    expect(screen.queryByAltText('Mercado Pago')).not.toBeInTheDocument();
  });

  it('com gateways configurados mostra a chave Pix e os gateways', async () => {
    api.conexoes.mockResolvedValue({ configurado: true, disponiveis: ['mercadopago'], conexao: null });
    render(<RecebimentosSection />);
    expect(screen.getByText('Cartão do Pix manual')).toBeInTheDocument();
    expect(await screen.findByAltText('Mercado Pago')).toBeInTheDocument();
  });

  it('mostra as quatro logos; só o Mercado Pago é link e os demais são Em breve', async () => {
    api.conexoes.mockResolvedValue({ configurado: true, disponiveis: ['mercadopago'], conexao: null });
    render(<RecebimentosSection />);
    for (const nome of ['Mercado Pago', 'Asaas', 'InfinitePay', 'PagBank']) {
      expect(await screen.findByAltText(nome)).toBeInTheDocument();
    }
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/dashboard/configuracoes/recebimentos/mercadopago');
    expect(screen.getAllByText('Em breve')).toHaveLength(3);
    expect(screen.getByText('Disponível')).toBeInTheDocument();
  });

  it('mostra Conectado quando há conexão', async () => {
    api.conexoes.mockResolvedValue({ configurado: true, disponiveis: ['mercadopago'], conexao });
    render(<RecebimentosSection />);
    expect(await screen.findByText('Conectado')).toBeInTheDocument();
  });

  it('a InfinitePay fica Disponível e vira link quando está em disponiveis', async () => {
    api.conexoes.mockResolvedValue({ configurado: true, disponiveis: ['mercadopago', 'infinitepay'], conexao: null });
    render(<RecebimentosSection />);
    expect(await screen.findByAltText('InfinitePay')).toBeInTheDocument();
    expect(screen.getAllByText('Disponível')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'InfinitePay: Disponível' })).toHaveAttribute('href', '/dashboard/configuracoes/recebimentos/infinitepay');
  });

  it('o Mercado Pago só fica Disponível se estiver em disponiveis', async () => {
    api.conexoes.mockResolvedValue({ configurado: true, disponiveis: ['infinitepay'], conexao: null });
    render(<RecebimentosSection />);
    expect(await screen.findByAltText('Mercado Pago')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Mercado Pago/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'InfinitePay: Disponível' })).toBeInTheDocument();
  });

  it('com uma conexão, o outro gateway aparece Disponível mas não abre', async () => {
    api.conexoes.mockResolvedValue({ configurado: true, disponiveis: ['mercadopago', 'infinitepay'], conexao: { ...conexao, gateway: 'infinitepay' } });
    render(<RecebimentosSection />);
    expect(await screen.findByText('Conectado')).toBeInTheDocument();
    expect(screen.getByText('Disponível')).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/dashboard/configuracoes/recebimentos/infinitepay');
  });
});
