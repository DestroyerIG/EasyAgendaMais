import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ conexoes: vi.fn() }));
vi.mock('@/lib/recebimentos', async (orig) => ({ ...(await orig<typeof import('@/lib/recebimentos')>()), recebimentosApi: api }));
const usuario = vi.hoisted(() => ({ atual: { role: 'tenant_admin' } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: usuario.atual }) }));

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

  it('não renderiza com configurado false', async () => {
    api.conexoes.mockResolvedValue({ configurado: false, conexao: null });
    const { container } = render(<RecebimentosSection />);
    await waitFor(() => expect(api.conexoes).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('mostra as quatro logos; só o Mercado Pago é link e os demais são Em breve', async () => {
    api.conexoes.mockResolvedValue({ configurado: true, conexao: null });
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
    api.conexoes.mockResolvedValue({ configurado: true, conexao });
    render(<RecebimentosSection />);
    expect(await screen.findByText('Conectado')).toBeInTheDocument();
  });
});
