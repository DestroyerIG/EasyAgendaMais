import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const api = vi.hoisted(() => ({
  conexao: vi.fn(), conectar: vi.fn(), definirProfissional: vi.fn(), desconectar: vi.fn(), ocupado: vi.fn(),
}));
vi.mock('@/lib/googleAgenda', async (orig) => ({ ...(await orig<typeof import('@/lib/googleAgenda')>()), googleAgendaApi: api }));
const toast = vi.hoisted(() => vi.fn());
vi.mock('@/components/Toast', () => ({ useToast: () => ({ showToast: toast }) }));
const usuario = vi.hoisted(() => ({ atual: { role: 'tenant_admin', vocabulario: null as unknown } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: usuario.atual }) }));

const { GoogleAgendaCard } = await import('../GoogleAgendaCard');
const LOCATION_ORIGINAL = window.location;

const BARBEARIA = {
  segmento: 'barbearia',
  profissional: { singular: 'barbeiro', plural: 'barbeiros', genero: 'm' },
  cliente: { singular: 'cliente', plural: 'clientes', genero: 'm' },
  negocio: { singular: 'barbearia', plural: 'barbearias', genero: 'f' },
};
const conectada = {
  configurado: true,
  conexao: { tipo: 'negocio', googleEmail: 'ana@gmail.com', status: 'ativa', ultimaSyncEm: '2026-11-10T13:05:00Z', professionalId: null },
  profissionais: [
    { professionalId: 'p1', nome: 'Camila', status: 'ativa' },
    { professionalId: 'p2', nome: 'Bia', status: null },
    { professionalId: 'p3', nome: 'Duda', status: 'reconectar' },
    { professionalId: 'p4', nome: 'Lia', status: 'pausada_plano' },
  ],
};

describe('GoogleAgendaCard', () => {
  const assign = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    usuario.atual = { role: 'tenant_admin', vocabulario: null };
    Object.defineProperty(window, 'location', { configurable: true, value: { ...LOCATION_ORIGINAL, assign, search: '' } });
  });
  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: LOCATION_ORIGINAL });
  });

  it('não aparece sem configuração', async () => {
    api.conexao.mockResolvedValue({ configurado: false, conexao: null });
    const { container } = render(<GoogleAgendaCard para="negocio" />);
    await waitFor(() => expect(api.conexao).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('desconectado mostra Conectar Google Agenda e redireciona', async () => {
    api.conexao.mockResolvedValue({ configurado: true, conexao: null, profissionais: [] });
    api.conectar.mockResolvedValue({ url: 'https://accounts.google.com/o/oauth2/v2/auth?x=1' });
    render(<GoogleAgendaCard para="negocio" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Conectar Google Agenda' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?x=1'));
    expect(api.conectar).toHaveBeenCalledWith('negocio');
  });

  it('conectado mostra e-mail, última sincronização e Desconectar', async () => {
    api.conexao.mockResolvedValueOnce(conectada).mockResolvedValue({ configurado: true, conexao: null, profissionais: [] });
    api.desconectar.mockResolvedValue({ desconectado: true });
    render(<GoogleAgendaCard para="negocio" />);
    expect(await screen.findByText('ana@gmail.com')).toBeInTheDocument();
    expect(screen.getByText(/Última sincronização/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Desconectar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sim, desconectar' }));
    await waitFor(() => expect(api.desconectar).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: 'Conectar Google Agenda' })).toBeInTheDocument();
  });

  it('dona escolhe quem ela é na grade, no vocabulário do segmento', async () => {
    usuario.atual = { role: 'tenant_admin', vocabulario: BARBEARIA };
    api.conexao.mockResolvedValue(conectada);
    api.definirProfissional.mockResolvedValue({ ...conectada, conexao: { ...conectada.conexao, professionalId: 'p1' } });
    render(<GoogleAgendaCard para="negocio" />);
    const select = await screen.findByLabelText(/Você também atende como barbeiro\?/);
    expect(screen.getByRole('option', { name: 'Não atendo' })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'p1' } });
    await waitFor(() => expect(api.definirProfissional).toHaveBeenCalledWith('p1'));
    fireEvent.change(select, { target: { value: '' } });
    await waitFor(() => expect(api.definirProfissional).toHaveBeenLastCalledWith(null));
  });

  it('precisa reconectar', async () => {
    api.conexao.mockResolvedValue({ ...conectada, conexao: { ...conectada.conexao, status: 'reconectar' } });
    api.conectar.mockResolvedValue({ url: 'https://accounts.google.com/x' });
    render(<GoogleAgendaCard para="negocio" />);
    expect(await screen.findByText(/O Google recusou o acesso/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reconectar' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://accounts.google.com/x'));
  });

  it('lista das profissionais para a dona', async () => {
    api.conexao.mockResolvedValue(conectada);
    render(<GoogleAgendaCard para="negocio" />);
    const lista = await screen.findByRole('list', { name: /Google Agenda da equipe/ });
    expect(lista).toHaveTextContent('CamilaConectada');
    expect(lista).toHaveTextContent('BiaNão conectada');
    expect(lista).toHaveTextContent('DudaPrecisa reconectar');
    expect(lista).toHaveTextContent('LiaPausada pelo plano');
  });

  it('profissional não vê a escolha nem a lista', async () => {
    usuario.atual = { role: 'professional', vocabulario: null };
    api.conexao.mockResolvedValue({ configurado: true, conexao: { ...conectada.conexao, tipo: 'profissional' } });
    render(<GoogleAgendaCard para="profissional" />);
    expect(await screen.findByText('ana@gmail.com')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Você também atende/)).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('volta do Google mostra o resultado', async () => {
    api.conexao.mockResolvedValue({ configurado: true, conexao: null, profissionais: [] });
    Object.defineProperty(window, 'location', { configurable: true, value: { ...LOCATION_ORIGINAL, assign, search: '?google=ok' } });
    const { unmount } = render(<GoogleAgendaCard para="negocio" />);
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Google Agenda conectado.', 'success'));
    unmount();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...LOCATION_ORIGINAL, assign, search: '?google=erro' } });
    render(<GoogleAgendaCard para="negocio" />);
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Não foi possível conectar o Google Agenda. Tente de novo.', 'error'));
  });
});
