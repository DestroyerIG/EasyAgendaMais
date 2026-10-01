import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TopBar } from '../TopBar';
import { notificationsApi } from '@/lib/notifications';

vi.mock('@/lib/notifications', () => ({
  notificationsApi: {
    unreadCount: vi.fn().mockResolvedValue(0),
    list: vi.fn().mockResolvedValue([]),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}));

const renderTopBar = () =>
  render(
    <TopBar
      activeId="hoje"
      pageTitle="Hoje"
      businessName="Studio Aurora"
      roleLabel="Administradora"
      onLogout={vi.fn()}
    />
  );

describe('TopBar — sino de notificações', () => {
  beforeEach(() => vi.clearAllMocks());

  it('clicar no sino abre o painel de notificações, não o menu de tema/sair', async () => {
    const user = userEvent.setup();
    renderTopBar();

    const sinos = screen.getAllByTitle('Notificações');
    await user.click(sinos[0]);

    expect(await screen.findByText('Notificações')).toBeInTheDocument();
    expect(screen.queryByText('Tema')).not.toBeInTheDocument();
    expect(screen.queryByText('Sair')).not.toBeInTheDocument();
  });

  it('não mostra o indicador de não lidas quando a contagem é zero', async () => {
    renderTopBar();
    await waitFor(() => expect(notificationsApi.unreadCount).toHaveBeenCalled());

    const sinos = screen.getAllByTitle('Notificações');
    sinos.forEach((sino) => {
      expect(sino.querySelector('.bg-brand')).not.toBeInTheDocument();
    });
  });

  it('mostra o indicador de não lidas quando há notificações pendentes', async () => {
    (notificationsApi.unreadCount as ReturnType<typeof vi.fn>).mockResolvedValue(2);
    renderTopBar();

    await waitFor(() => {
      const sinos = screen.getAllByTitle('Notificações');
      expect(sinos.some((sino) => sino.querySelector('.bg-brand'))).toBe(true);
    });
  });
});
