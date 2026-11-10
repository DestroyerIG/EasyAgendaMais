import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { useRegisterTopBarSearch } from '../TopBarSearchContext';

const mockPathname = vi.hoisted(() => ({ value: '/dashboard' }));
const mockLogout = vi.hoisted(() => vi.fn());
const mockReplace = vi.hoisted(() => vi.fn());
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
  useRouter: () => ({ push: vi.fn(), replace: mockReplace, prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockUser.value, logout: mockLogout }),
}));

const mockEstado = vi.hoisted(() => ({ value: { tipo: 'ativa' } as Record<string, unknown> }));
vi.mock('@/lib/conta', () => ({
  contaApi: { estado: () => Promise.resolve(mockEstado.value), baixarBackup: vi.fn() },
}));

const { AppShell } = await import('../AppShell');

const LABELS = ['Hoje', 'Agenda', 'Clientes', 'Caixa', 'Clube e pacotes', 'WhatsApp', 'Relatórios', 'Minha página', 'Configurações'];
const MORE_LABELS = ['Caixa', 'Clube e pacotes', 'WhatsApp', 'Relatórios', 'Minha página', 'Configurações'];

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
    mockReplace.mockReset();
    mockEstado.value = { tipo: 'ativa' };
    window.sessionStorage.clear();
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

  it('Configurações fica ativo em /servicos', () => {
    mockPathname.value = '/servicos';
    renderShell();
    const sidebar = screen.getByRole('navigation', { name: 'Navegação principal' });
    expect(within(sidebar).getByRole('link', { name: 'Configurações' })).toHaveAttribute('aria-current', 'page');
    expect(within(sidebar).getByRole('link', { name: 'Hoje' })).not.toHaveAttribute('aria-current');
  });

  it('barra inferior com Hoje, Agenda, +, Clientes e Mais', () => {
    renderShell();
    const bottom = screen.getByRole('navigation', { name: 'Navegação inferior' });
    const links = within(bottom).getAllByRole('link');
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveTextContent('Hoje');
    expect(links[1]).toHaveTextContent('Agenda');
    expect(links[2]).toHaveTextContent('Clientes');
    expect(within(bottom).getByRole('button', { name: 'Criar novo' })).toHaveAttribute('aria-expanded', 'false');
    expect(within(bottom).getByRole('button', { name: 'Mais' })).toBeInTheDocument();
  });

  it('o + abre dois balões: novo agendamento e novo cliente', async () => {
    renderShell();
    expect(screen.queryByRole('link', { name: 'Novo agendamento' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Novo cliente' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Criar novo' }));

    expect(screen.getByRole('button', { name: 'Criar novo' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Novo agendamento' })).toHaveAttribute('href', '/agendamentos?novo=1');
    expect(screen.getByRole('link', { name: 'Novo cliente' })).toHaveAttribute('href', '/clientes?novo=1');
  });

  it('os balões fecham com Esc, com toque no fundo e ao escolher uma opção', async () => {
    renderShell();
    const abrir = screen.getByRole('button', { name: 'Criar novo' });

    await userEvent.click(abrir);
    await userEvent.keyboard('{Escape}');
    expect(abrir).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(abrir);
    await userEvent.click(screen.getByTestId('fundo-baloes'));
    expect(abrir).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(abrir);
    await userEvent.click(screen.getByRole('link', { name: 'Novo cliente' }));
    expect(abrir).toHaveAttribute('aria-expanded', 'false');
  });

  it('menu Mais tem Caixa, Clube e pacotes, WhatsApp, Relatórios, Minha página, Configurações, tema e Sair', async () => {
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

  it('a busca da barra superior fica ativa em qualquer tela', () => {
    renderShell();
    expect(screen.getByPlaceholderText('Buscar cliente, agendamento ou tela...')).toBeEnabled();
  });

  it('registrar a busca de uma tela não avisa "uncontrolled input" (regressão: input trocava de sem value para com value)', () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      function TelaComBusca() {
        const [termo, setTermo] = useState('');
        useRegisterTopBarSearch({ value: termo, onChange: setTermo });
        return <p>conteúdo com busca</p>;
      }

      render(
        <ThemeProvider>
          <AppShell>
            <TelaComBusca />
          </AppShell>
        </ThemeProvider>,
      );

      const chamadasDeControle = erro.mock.calls.filter((args) =>
        String(args[0]).includes('changing an uncontrolled input'),
      );
      expect(chamadasDeControle).toHaveLength(0);
    } finally {
      erro.mockRestore();
    }
  });

  it('o papel professional não vê o painel: vai para a bancada', () => {
    mockUser.value = { ...mockUser.value, role: 'professional' };
    renderShell();
    expect(screen.queryByText('conteúdo')).not.toBeInTheDocument();
    expect(mockReplace).toHaveBeenCalledWith('/bancada');
  });

  it('dona com o onboarding pendente vai para /onboarding e não vê o painel', () => {
    mockUser.value = { ...mockUser.value, onboarding: { pendente: true, bloqueante: true, etapa: 2 } };
    renderShell();
    expect(screen.queryByText('conteúdo')).not.toBeInTheDocument();
    expect(mockReplace).toHaveBeenCalledWith('/onboarding');
  });

  it('onboarding pendente mas já passou das etapas obrigatórias: o painel abre', () => {
    mockUser.value = { ...mockUser.value, onboarding: { pendente: true, bloqueante: false, etapa: 4 } };
    renderShell();
    expect(screen.getByText('conteúdo')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('funcionária não é mandada para o onboarding', () => {
    mockUser.value = { ...mockUser.value, role: 'employee', onboarding: { pendente: true, bloqueante: true, etapa: 1 } };
    renderShell();
    expect(screen.getByText('conteúdo')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalledWith('/onboarding');
  });

  describe('estado da conta', () => {
    it('carência: mostra a faixa e leva à assinatura só na primeira tela', async () => {
      mockEstado.value = { tipo: 'carencia', desde: '2026-10-20', ate: '2026-10-27', diasRestantes: 3 };
      const { unmount } = renderShell();
      expect(await screen.findByText(/Modo contingência · 3 dias para regularizar/)).toBeInTheDocument();
      expect(mockReplace).toHaveBeenCalledWith('/dashboard/assinatura');
      unmount();
      mockReplace.mockReset();
      renderShell();
      await screen.findByText(/Modo contingência/);
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('bloqueada: redireciona sempre, menos nas páginas livres', async () => {
      mockEstado.value = { tipo: 'bloqueada', motivo: 'cobranca' };
      const { unmount } = renderShell();
      await vi.waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/dashboard/assinatura'));
      unmount();
      mockReplace.mockReset();
      mockPathname.value = '/dashboard/planos';
      renderShell();
      await new Promise((r) => setTimeout(r, 20));
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });
});
