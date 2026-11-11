import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const api = vi.hoisted(() => ({ conexoes: vi.fn() }));
const pagina = vi.hoisted(() => ({ getSettings: vi.fn(), updateSettings: vi.fn() }));
vi.mock('@/lib/businessPublicPage', () => ({ businessPublicPageApi: pagina }));
vi.mock('@/lib/recebimentos', async (orig) => ({ ...(await orig<typeof import('@/lib/recebimentos')>()), recebimentosApi: api }));
const usuario = vi.hoisted(() => ({ atual: { role: 'tenant_admin' } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: usuario.atual }) }));
vi.mock('@/components/recebimentos/PixManualCard', () => ({
  PixManualCard: ({ confirmacaoAutomatica, onSalvo }: { confirmacaoAutomatica?: boolean; onSalvo?: () => void }) => (
    <div>
      <p>Cartão do Pix manual{confirmacaoAutomatica ? ' (reserva)' : ''}</p>
      <button type="button" onClick={onSalvo}>Simular chave salva</button>
    </div>
  ),
}));

vi.mock('@/components/recebimentos/PointCard', () => ({ PointCard: () => <p>Cartão da maquininha Point</p> }));

const { RecebimentosSection } = await import('../RecebimentosSection');

const conexao = {
  gateway: 'mercadopago', situacao: 'ativa', contaNome: 'Barbearia Ana', aceitaPix: true, aceitaCartao: false,
  aceiteCartaoEm: null, ultimaConfirmacaoEm: null, reservasPendentes: 0,
};

describe('RecebimentosSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usuario.atual = { role: 'tenant_admin' };
    pagina.getSettings.mockResolvedValue({ pixKey: null, botCobraSinal: false });
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

  it('a chave Pix vira reserva só com conexão ativa', async () => {
    api.conexoes.mockResolvedValue({ configurado: true, disponiveis: ['mercadopago'], conexao });
    render(<RecebimentosSection />);
    expect(await screen.findByText('Cartão do Pix manual (reserva)')).toBeInTheDocument();
  });

  it('conexão que precisa reconectar mantém a confirmação manual', async () => {
    api.conexoes.mockResolvedValue({ configurado: true, disponiveis: ['mercadopago'], conexao: { ...conexao, situacao: 'precisa_reconectar' } });
    render(<RecebimentosSection />);
    expect(await screen.findByText('Precisa reconectar')).toBeInTheDocument();
    expect(screen.getByText('Cartão do Pix manual')).toBeInTheDocument();
  });

  it('Mercado Pago só no cartão mantém o Pix manual', async () => {
    api.conexoes.mockResolvedValue({ configurado: true, disponiveis: ['mercadopago'], conexao: { ...conexao, aceitaPix: false, aceitaCartao: true } });
    render(<RecebimentosSection />);
    expect(await screen.findByText('Conectado')).toBeInTheDocument();
    expect(screen.getByText('Cartão do Pix manual')).toBeInTheDocument();
  });

  it('InfinitePay ativa deixa a chave como reserva', async () => {
    api.conexoes.mockResolvedValue({ configurado: true, disponiveis: ['infinitepay'], conexao: { ...conexao, gateway: 'infinitepay', aceitaPix: false, aceitaCartao: true } });
    render(<RecebimentosSection />);
    expect(await screen.findByText('Cartão do Pix manual (reserva)')).toBeInTheDocument();
  });

  it('ao salvar a chave Pix, o interruptor do robô é liberado sem recarregar a página', async () => {
    api.conexoes.mockResolvedValue({ configurado: false, conexao: null });
    pagina.getSettings
      .mockResolvedValueOnce({ pixKey: null, botCobraSinal: false })
      .mockResolvedValue({ pixKey: 'pix@aurora.com', botCobraSinal: false });
    const user = userEvent.setup();
    render(<RecebimentosSection />);
    expect(await screen.findByRole('switch', { name: 'Cobrar o sinal pelo WhatsApp' })).toBeDisabled();
    expect(screen.getByText('Cadastre a chave Pix acima para ativar.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Simular chave salva' }));

    await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
    expect(screen.queryByText('Cadastre a chave Pix acima para ativar.')).not.toBeInTheDocument();
  });

  describe('cartão da maquininha Point', () => {
    it('aparece com o Mercado Pago conectado e ativo', async () => {
      api.conexoes.mockResolvedValue({ configurado: true, disponiveis: ['mercadopago'], conexao });
      render(<RecebimentosSection />);
      expect(await screen.findByText('Cartão da maquininha Point')).toBeInTheDocument();
    });

    it('não aparece sem conexão, com a InfinitePay nem com o Mercado Pago pedindo reconexão', async () => {
      api.conexoes.mockResolvedValue({ configurado: true, disponiveis: ['mercadopago'], conexao: null });
      const { unmount } = render(<RecebimentosSection />);
      await screen.findByText('Confirmação automática');
      expect(screen.queryByText('Cartão da maquininha Point')).not.toBeInTheDocument();
      unmount();

      api.conexoes.mockResolvedValue({ configurado: true, disponiveis: ['infinitepay'], conexao: { ...conexao, gateway: 'infinitepay' } });
      const segunda = render(<RecebimentosSection />);
      await screen.findByText('Conectado');
      expect(screen.queryByText('Cartão da maquininha Point')).not.toBeInTheDocument();
      segunda.unmount();

      api.conexoes.mockResolvedValue({ configurado: true, disponiveis: ['mercadopago'], conexao: { ...conexao, situacao: 'precisa_reconectar' } });
      render(<RecebimentosSection />);
      await screen.findByText('Precisa reconectar');
      expect(screen.queryByText('Cartão da maquininha Point')).not.toBeInTheDocument();
    });
  });
});
