import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@/components/theme/ThemeProvider';

const mockPathname = vi.hoisted(() => ({ value: '/dashboard' }));
const mockLogout = vi.hoisted(() => vi.fn());
const mockUser = vi.hoisted(() => ({
  value: { businessName: 'Studio Aurora', subscriptionStatus: 'active', subscriptionCurrentPeriodEnd: null } as Record<string, unknown>,
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
    mockUser.value = { businessName: 'Studio Aurora', subscriptionStatus: 'active', subscriptionCurrentPeriodEnd: null };
  });

  it('barra lateral com os seis itens na ordem', () => {
    renderShell();
    const sidebar = screen.getByRole('navigation', { name: 'Navegação principal' });
    expect(within(sidebar).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Hoje',
      'Agenda',
      'Clientes',
      'Caixa',
      'WhatsApp',
      'Ajustes',
    ]);
    expect(screen.getAllByText('Studio Aurora').length).toBeGreaterThan(0);
  });

  it('Ajustes fica ativo em /servicos', () => {
    mockPathname.value = '/servicos';
    renderShell();
    const sidebar = screen.getByRole('navigation', { name: 'Navegação principal' });
    expect(within(sidebar).getByRole('link', { name: 'Ajustes' })).toHaveAttribute('aria-current', 'page');
    expect(within(sidebar).getByRole('link', { name: 'Hoje' })).not.toHaveAttribute('aria-current');
  });

  it('barra inferior com Hoje, Agenda, +, Clientes e Mais', () => {
    renderShell();
    const bottom = screen.getByRole('navigation', { name: 'Navegação inferior' });
    const links = within(bottom).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('aria-label') ?? link.textContent)).toEqual([
      'Hoje',
      'Agenda',
      'Novo agendamento',
      'Clientes',
    ]);
    expect(within(bottom).getByRole('link', { name: 'Novo agendamento' })).toHaveAttribute('href', '/agendamentos?novo=1');
    expect(within(bottom).getByRole('button', { name: 'Mais' })).toBeInTheDocument();
  });

  it('menu Mais tem Caixa, WhatsApp, Ajustes, tema e Sair', async () => {
    renderShell();
    const bottom = screen.getByRole('navigation', { name: 'Navegação inferior' });
    await userEvent.click(within(bottom).getByRole('button', { name: 'Mais' }));
    const sheet = await screen.findByRole('dialog', { name: 'Mais' });
    expect(within(sheet).getAllByRole('link').map((link) => link.textContent)).toEqual(['Caixa', 'WhatsApp', 'Ajustes']);
    expect(within(sheet).getByRole('radiogroup', { name: 'Tema' })).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Sair' }));
    expect(mockLogout).toHaveBeenCalled();
  });

  it('mostra o aviso do período de teste quando está em trial', () => {
    const inFiveDays = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    mockUser.value = { businessName: 'Studio Aurora', subscriptionStatus: 'trialing', subscriptionCurrentPeriodEnd: inFiveDays };
    renderShell();
    expect(screen.getByRole('status')).toHaveTextContent('5 dias restantes');
  });

  it('o conteúdo fica em main#main-content', () => {
    renderShell();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  });
});
