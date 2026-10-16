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
vi.mock('@/lib/api', () => ({
  default: { get: (...a: unknown[]) => get(...a), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
const showToast = vi.fn();
vi.mock('@/components/Toast', () => ({ useToast: () => ({ showToast }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { businessId: 'b1' } }) }));
vi.mock('@/components/whatsapp/ConnectionPanel', () => ({ ConnectionPanel: () => <div>painel-conexao</div> }));
vi.mock('@/components/whatsapp/conversas/CentralConversas', () => ({ CentralConversas: () => <div>painel-conversas</div> }));
vi.mock('@/components/whatsapp/MenuOptionsPanel', () => ({ MenuOptionsPanel: () => <div>painel-menu</div> }));
vi.mock('@/components/whatsapp/MessageConfigPanel', () => ({ MessageConfigPanel: () => <div>painel-mensagens</div> }));
vi.mock('@/components/whatsapp/ChatSimulator', () => ({ ChatSimulator: () => <div>painel-simulador</div> }));

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
    abaNaUrl = null;
  });

  it('mostra as abas Automações, Conversas e Conexão, nessa ordem, e nenhuma outra', async () => {
    responderStatus('connected');
    render(<WhatsAppModule />);
    await screen.findByText('painel-conversas');
    const nomes = screen.getAllByRole('tab').map((t) => (t.textContent ?? '').replace(/^(bolt|chat|smartphone)/, ''));
    expect(nomes).toEqual(['Automações', 'Conversas', 'Conexão']);
    expect(screen.queryByRole('tab', { name: 'Hora de voltar' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Campanhas' })).toBeNull();
    expect(screen.queryByRole('tab', { name: /^list ?Menu$/ })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Simulador' })).toBeNull();
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

  it('o cabeçalho mostra o caminho WhatsApp / aba', async () => {
    responderStatus('connected');
    render(<WhatsAppModule />);
    expect(await screen.findByText('WhatsApp / Conversas')).toBeInTheDocument();
  });

  it('clicar em Automações troca a aba pela URL, sem empilhar histórico', async () => {
    responderStatus('connected');
    render(<WhatsAppModule />);
    await screen.findByText('painel-conversas');
    await userEvent.click(screen.getByRole('tab', { name: 'Automações' }));
    expect(replace).toHaveBeenCalledWith('?aba=automacoes', { scroll: false });
    expect(await screen.findByText('painel-menu')).toBeInTheDocument();
  });

  it('Automações oferece os painéis Menu, Mensagens e Simulador', async () => {
    abaNaUrl = 'automacoes';
    responderStatus('connected');
    render(<WhatsAppModule />);
    expect(await screen.findByText('painel-menu')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Mensagens' }));
    await waitFor(() => expect(screen.getByText('painel-mensagens')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('tab', { name: 'Simulador' }));
    await waitFor(() => expect(screen.getByText('painel-simulador')).toBeInTheDocument());
  });
});
