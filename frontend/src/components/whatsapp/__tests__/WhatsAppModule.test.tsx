import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const replace = vi.fn();
let abaNaUrl: string | null = null;
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(abaNaUrl ? `aba=${abaNaUrl}` : ''),
}));

const get = vi.fn();
const post = vi.fn();
const put = vi.fn();
vi.mock('@/lib/api', () => ({
  default: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a), put: (...a: unknown[]) => put(...a), delete: vi.fn() },
}));
const showToast = vi.fn();
vi.mock('@/components/Toast', () => ({ useToast: () => ({ showToast }) }));
const usuario = { businessId: 'b1', businessName: 'Studio Aurora' };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: usuario }) }));
vi.mock('@/components/whatsapp/ConnectionPanel', () => ({
  ConnectionPanel: (p: { nomeNegocio: string; onDisconnect: () => void; onTestSend: () => void; onRefresh: () => void }) => (
    <div>
      painel-conexao
      <span>negocio:{p.nomeNegocio}</span>
      <button onClick={p.onDisconnect}>acao-desconectar</button>
      <button onClick={p.onTestSend}>acao-testar</button>
      <button onClick={p.onRefresh}>acao-atualizar</button>
    </div>
  ),
}));
vi.mock('@/components/whatsapp/retorno/HoraDeVoltar', () => ({ HoraDeVoltar: () => <div>painel-hora-de-voltar</div> }));
vi.mock('@/components/whatsapp/campanhas/Campanhas', () => ({ Campanhas: () => <div>painel-campanhas</div> }));
vi.mock('@/components/whatsapp/conversas/CentralConversas', () => ({ CentralConversas: () => <div>painel-conversas</div> }));
vi.mock('@/components/whatsapp/MenuOptionsPanel', () => ({
  MenuOptionsPanel: (p: { onToggle: (id: string, a: boolean) => void; onUpdate: (id: string, d: object) => void; onReorder: (ids: string[]) => void }) => (
    <div>
      painel-menu
      <button onClick={() => p.onToggle('velho', true)}>acao-ligar</button>
      <button onClick={() => p.onUpdate('velho', { label: 'X' })}>acao-editar</button>
      <button onClick={() => p.onReorder(['velho'])}>acao-reordenar</button>
    </div>
  ),
}));
vi.mock('@/components/whatsapp/ChatSimulator', () => ({
  ChatSimulator: (p: { temAlteracoes?: boolean }) => <div>painel-simulador<span>alteracoes:{String(p.temAlteracoes)}</span></div>,
}));
const automacoesProps = vi.hoisted(() => ({ conectado: null as null | boolean }));
vi.mock('@/components/whatsapp/automacoes/Automacoes', () => ({
  Automacoes: (p: { conectado: boolean; onAbrirConexao: () => void }) => {
    automacoesProps.conectado = p.conectado;
    return <div>painel-automacoes<button onClick={p.onAbrirConexao}>abrir-conexao</button></div>;
  },
}));

import { WhatsAppModule } from '../../WhatsAppModule';

const responderStatus = (status: string) =>
  get.mockImplementation(async (url: string) => {
    if (url === '/whatsapp/status') return { data: { status } };
    return { data: [] };
  });

describe('WhatsAppModule', () => {
  beforeEach(() => {
    get.mockReset();
    replace.mockReset();
    post.mockReset();
    put.mockReset();
    post.mockResolvedValue({ data: {} });
    abaNaUrl = null;
  });

  it('mostra as abas Hora de voltar, Automações, Campanhas, Conversas e Conexão, nessa ordem, e nenhuma outra', async () => {
    responderStatus('connected');
    render(<WhatsAppModule />);
    await screen.findByText('painel-conversas');
    const nomes = screen.getAllByRole('tab').map((t) => (t.textContent ?? ''));
    expect(nomes).toEqual(['Hora de voltar', 'Automações', 'Campanhas', 'Conversas', 'Conexão']);
    expect(screen.queryByRole('tab', { name: /^list ?Menu$/ })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Simulador' })).toBeNull();
  });

  it('?aba=hora-de-voltar abre a Hora de voltar', async () => {
    abaNaUrl = 'hora-de-voltar';
    responderStatus('connected');
    render(<WhatsAppModule />);
    expect(await screen.findByText('painel-hora-de-voltar')).toBeInTheDocument();
  });

  it('?aba=campanhas abre a aba Campanhas', async () => {
    abaNaUrl = 'campanhas';
    responderStatus('connected');
    render(<WhatsAppModule />);
    expect(await screen.findByText('painel-campanhas')).toBeInTheDocument();
  });

  it('?aba=conexao abre a aba Conexão', async () => {
    abaNaUrl = 'conexao';
    responderStatus('connected');
    render(<WhatsAppModule />);
    expect(await screen.findByText('painel-conexao')).toBeInTheDocument();
  });

  it('sem ?aba e conectado abre Conversas', async () => {
    responderStatus('connected');
    render(<WhatsAppModule />);
    expect(await screen.findByText('painel-conversas')).toBeInTheDocument();
  });

  it('sem ?aba e desconectado abre Conexão', async () => {
    responderStatus('disconnected');
    render(<WhatsAppModule />);
    expect(await screen.findByText('painel-conexao')).toBeInTheDocument();
  });

  it('mostra a barra de abas com a aba ativa marcada e sem o título "WhatsApp"', async () => {
    responderStatus('connected');
    render(<WhatsAppModule />);
    await screen.findByText('painel-conversas');
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Conversas' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Conexão' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.queryByRole('heading', { name: 'WhatsApp' })).toBeNull();
    expect(screen.queryByText('WhatsApp / Conversas')).toBeNull();
  });

  it('clicar em Automações troca a aba pela URL, sem empilhar histórico', async () => {
    responderStatus('connected');
    render(<WhatsAppModule />);
    await screen.findByText('painel-conversas');
    await userEvent.click(screen.getByRole('tab', { name: 'Automações' }));
    expect(replace).toHaveBeenCalledWith('?aba=automacoes', { scroll: false });
    expect(await screen.findByText('painel-automacoes')).toBeInTheDocument();
  });

  it('Automações mostra a tela nova, sem os painéis Menu e Simulador do robô', async () => {
    abaNaUrl = 'automacoes';
    responderStatus('connected');
    render(<WhatsAppModule />);
    expect(await screen.findByText('painel-automacoes')).toBeInTheDocument();
    expect(automacoesProps.conectado).toBe(true);
    expect(screen.queryByText('painel-menu')).toBeNull();
    expect(screen.queryByText('painel-simulador')).toBeNull();
    expect(screen.queryByRole('tab', { name: /Menu/ })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Simulador/ })).toBeNull();
    expect(screen.queryByText('Robô de atendimento')).toBeNull();
  });

  it('o "Configurações de envio" das Automações leva à aba Conexão', async () => {
    abaNaUrl = 'automacoes';
    responderStatus('connected');
    render(<WhatsAppModule />);
    await userEvent.click(await screen.findByText('abrir-conexao'));
    expect(replace).toHaveBeenCalledWith('?aba=conexao', { scroll: false });
    expect(await screen.findByText(/painel-conexao/)).toBeInTheDocument();
  });

  it('Conexão mostra o Robô de atendimento abaixo do painel de conexão, sem sub-abas', async () => {
    abaNaUrl = 'conexao';
    responderStatus('connected');
    render(<WhatsAppModule />);
    expect(await screen.findByRole('heading', { name: 'Robô de atendimento' })).toBeInTheDocument();
    expect(await screen.findByText('painel-menu')).toBeInTheDocument();
    const conexao = screen.getByText(/painel-conexao/);
    const robo = screen.getByRole('heading', { name: 'Robô de atendimento' });
    expect(conexao.compareDocumentPosition(robo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole('tab', { name: /Mensagens/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Testar/ }));
    await waitFor(() => expect(screen.getByText('painel-simulador')).toBeInTheDocument());
    expect(get).toHaveBeenCalledWith('/whatsapp/config/textos');
    expect(get).toHaveBeenCalledWith('/whatsapp/config/menu');
    expect(get).not.toHaveBeenCalledWith('/whatsapp/config');
  });

  it.each([
    ['acao-ligar', 'ligar'],
    ['acao-editar', 'editar'],
    ['acao-reordenar', 'reordenar'],
  ])('erro ao %s recarrega o menu (ids velhos)', async (botao) => {
    abaNaUrl = 'conexao';
    responderStatus('connected');
    put.mockRejectedValue(new Error('409'));
    render(<WhatsAppModule />);
    await screen.findByText('painel-menu');
    get.mockClear();
    await userEvent.click(screen.getByText(botao));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/whatsapp/config/menu'));
  });

  it.each([
    ['acao-ligar', 'ligar'],
    ['acao-editar', 'editar'],
    ['acao-reordenar', 'reordenar'],
  ])('depois de %s com sucesso recarrega o menu para atualizar os números', async (botao) => {
    abaNaUrl = 'conexao';
    responderStatus('connected');
    put.mockResolvedValue({ data: {} });
    render(<WhatsAppModule />);
    await screen.findByText('painel-menu');
    get.mockClear();
    await userEvent.click(screen.getByText(botao));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/whatsapp/config/menu'));
  });

  it('a aba acompanha o ?aba= quando a URL muda (voltar/avançar e links internos)', async () => {
    abaNaUrl = 'conversas';
    responderStatus('connected');
    const { rerender } = render(<WhatsAppModule />);
    expect(await screen.findByText('painel-conversas')).toBeInTheDocument();
    abaNaUrl = 'conexao';
    rerender(<WhatsAppModule />);
    expect(await screen.findByText(/painel-conexao/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Conexão' })).toHaveAttribute('aria-selected', 'true');
    abaNaUrl = 'automacoes';
    rerender(<WhatsAppModule />);
    expect(await screen.findByText('painel-automacoes')).toBeInTheDocument();
  });

  it('liga a Conexão ao negócio, à desconexão (com confirmação), ao teste de envio e à atualização', async () => {
    abaNaUrl = 'conexao';
    responderStatus('connected');
    get.mockImplementation(async (url: string) =>
      url === '/whatsapp/status' ? { data: { status: 'connected', connectedNumber: '5583981204000' } } : { data: [] });
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<WhatsAppModule />);
    expect(await screen.findByText('negocio:Studio Aurora')).toBeInTheDocument();

    await userEvent.click(screen.getByText('acao-testar'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/whatsapp/test-send', expect.objectContaining({ phone: '5583981204000' })));

    await userEvent.click(screen.getByText('acao-desconectar'));
    expect(confirmar).toHaveBeenCalled();
    await waitFor(() => expect(post).toHaveBeenCalledWith('/whatsapp/disconnect'));

    const antes = get.mock.calls.filter((c) => c[0] === '/whatsapp/status').length;
    await userEvent.click(screen.getByText('acao-atualizar'));
    await waitFor(() => expect(get.mock.calls.filter((c) => c[0] === '/whatsapp/status').length).toBeGreaterThan(antes));
    confirmar.mockRestore();
  });
});
