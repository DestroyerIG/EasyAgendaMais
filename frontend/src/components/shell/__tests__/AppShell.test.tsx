import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@/components/theme/ThemeProvider';

const mockPathname = vi.hoisted(() => ({ value: '/dashboard' }));
const mockLogout = vi.hoisted(() => vi.fn());
const mockUser = vi.hoisted(() => ({
  value: {
    businessName: 'Studio Aurora',
    plan: 'profissional',
    role: 'tenant_admin',
    subscriptionStatus: 'active',
    subscriptionCurrentPeriodEnd: null,
  } as Record<string, unknown>,
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  usePathname: () => mockPathname.value,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser.value, logout: mockLogout }),
}));

const { AppShell } = await import('../AppShell');

const LABELS = ['Hoje', 'Agenda', 'Clientes', 'Caixa', 'Clube e pacotes', 'WhatsApp', 'Relatórios', 'Minha página', 'Ajustes'];
const MORE_LABELS = ['Caixa', 'Clube e pacotes', 'WhatsApp', 'Relatórios', 'Minha página', 'Ajustes'];

const renderShell = () =>
  render(
    <ThemeProvider>
      <AppShell>
        <p>conteúdo</p>
      </AppShell>
    </ThemeProvider>,
  );

describe('AppShell', () => {
  beforeEach(() => {
    mockPathname.value = '/dashboard';
    mockLogout.mockReset();
    mockUser.value = {
      businessName: 'Studio Aurora',
      plan: 'profissional',
      role: 'tenant_admin',
      subscriptionStatus: 'active',
      subscriptionCurrentPeriodEnd: null,
    };
  });

  it('barra lateral com os nove itens na ordem', () => {
    renderShell();
    const sidebar = screen.getByRole('navigation', { name: 'Navegação principal' });
    const links = within(sidebar).getAllByRole('link');
    expect(links).toHaveLength(LABELS.length);
    LABELS.forEach((label, index) => {
      expect(links[index]).toHaveTextContent(label);
    });
    expect(screen.getAllByText('Studio Aurora').length).toBeGreaterThan(0);
  });

  it('rodapé da barra lateral mostra o nome do plano traduzido (nunca "Pro")', () => {
    renderShell();
    expect(screen.getByText('Plano Equipe')).toBeInTheDocument();
    expect(screen.queryByText(/\bPro\b/)).not.toBeInTheDocument();
  });

  it('Ajustes fica ativo em /servicos', () => {
    mockPathname.value = '/servicos';
    renderShell();
    const sidebar = screen.getByRole('navigation', { name: 'Navegação principal' });
    expect(within(sidebar).getByRole('link', { name: /Ajustes/ })).toHaveAttribute('aria-current', 'page');
    expect(within(sidebar).getByRole('link', { name: /Hoje/ })).not.toHaveAttribute('aria-current');
  });

  it('barra inferior com Hoje, Agenda, +, Clientes e Mais', () => {
    renderShell();
    const bottom = screen.getByRole('navigation', { name: 'Navegação inferior' });
    const links = within(bottom).getAllByRole('link');
    expect(links).toHaveLength(4);
    expect(links[0]).toHaveTextContent('Hoje');
    expect(links[1]).toHaveTextContent('Agenda');
    expect(links[2]).toHaveAttribute('aria-label', 'Novo agendamento');
    expect(links[2]).toHaveAttribute('href', '/agendamentos?novo=1');
    expect(links[3]).toHaveTextContent('Clientes');
    expect(within(bottom).getByRole('button', { name: 'Mais' })).toBeInTheDocument();
  });

  it('menu Mais tem Caixa, Clube e pacotes, WhatsApp, Relatórios, Minha página, Ajustes, tema e Sair', async () => {
    renderShell();
    const bottom = screen.getByRole('navigation', { name: 'Navegação inferior' });
    await userEvent.click(within(bottom).getByRole('button', { name: 'Mais' }));
    const sheet = await screen.findByRole('dialog', { name: 'Mais' });
    const links = within(sheet).getAllByRole('link');
    expect(links).toHaveLength(MORE_LABELS.length);
    MORE_LABELS.forEach((label, index) => {
      expect(links[index]).toHaveTextContent(label);
    });
    expect(within(sheet).getByRole('radiogroup', { name: 'Tema' })).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Sair' }));
    expect(mockLogout).toHaveBeenCalled();
  });

  it('mostra o aviso do período de teste quando está em trial', () => {
    const inFiveDays = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    mockUser.value = {
      businessName: 'Studio Aurora',
      plan: 'profissional',
      role: 'tenant_admin',
      subscriptionStatus: 'trialing',
      subscriptionCurrentPeriodEnd: inFiveDays,
    };
    renderShell();
    expect(screen.getByRole('status')).toHaveTextContent('5 dias restantes');
  });

  it('o conteúdo fica em main#main-content', () => {
    renderShell();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  });

  it('a barra superior mostra o negócio, a página atual e o cargo do papel', () => {
    renderShell();
    expect(screen.getAllByText('Hoje').length).toBeGreaterThan(0);
    expect(screen.getByText('Administradora')).toBeInTheDocument();
  });

  it('a busca da barra superior fica desabilitada fora de Clientes', () => {
    renderShell();
    const search = screen.getByPlaceholderText('Buscar no sistema...');
    expect(search).toBeDisabled();
    expect(search).toHaveAttribute('title', expect.stringContaining('Hoje'));
  });
});
