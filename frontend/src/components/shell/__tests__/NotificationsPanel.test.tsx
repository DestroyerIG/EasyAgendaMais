import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationsPanel } from '../NotificationsPanel';
import { notificationsApi } from '@/lib/notifications';

vi.mock('@/lib/notifications', () => ({
  notificationsApi: {
    list: vi.fn(),
    markRead: vi.fn().mockResolvedValue(undefined),
    markAllRead: vi.fn().mockResolvedValue(undefined),
  },
}));

const NOTIFICATIONS = [
  {
    id: 'n1', type: 'nova_reserva' as const, title: 'Nova reserva online',
    description: 'Mariana · Corte · 24/10/2026 às 14:00', link: null, read: false,
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
  {
    id: 'n2', type: 'pagamento_confirmado' as const, title: 'Pagamento confirmado',
    description: 'Paula · Manicure', link: null, read: true,
    createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  (notificationsApi.list as ReturnType<typeof vi.fn>).mockResolvedValue(NOTIFICATIONS);
});

describe('NotificationsPanel', () => {
  it('mostra a lista de notificações e avisa a contagem de não lidas', async () => {
    const onUnreadCountChange = vi.fn();
    render(<NotificationsPanel onUnreadCountChange={onUnreadCountChange} />);

    expect(await screen.findByText('Nova reserva online')).toBeInTheDocument();
    expect(screen.getByText('Pagamento confirmado')).toBeInTheDocument();
    await waitFor(() => expect(onUnreadCountChange).toHaveBeenCalledWith(1));
  });

  it('mostra o estado vazio quando não há notificações', async () => {
    (notificationsApi.list as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<NotificationsPanel />);

    expect(await screen.findByText('Nenhuma notificação')).toBeInTheDocument();
  });

  it('marca uma notificação não lida como lida ao clicar', async () => {
    const user = userEvent.setup();
    const onUnreadCountChange = vi.fn();
    render(<NotificationsPanel onUnreadCountChange={onUnreadCountChange} />);

    await user.click(await screen.findByText('Nova reserva online'));

    expect(notificationsApi.markRead).toHaveBeenCalledWith('n1');
    await waitFor(() => expect(onUnreadCountChange).toHaveBeenCalledWith(0));
  });

  it('não chama markRead de novo ao clicar numa notificação já lida', async () => {
    const user = userEvent.setup();
    render(<NotificationsPanel />);

    await user.click(await screen.findByText('Pagamento confirmado'));

    expect(notificationsApi.markRead).not.toHaveBeenCalled();
  });

  it('marca todas como lidas', async () => {
    const user = userEvent.setup();
    const onUnreadCountChange = vi.fn();
    render(<NotificationsPanel onUnreadCountChange={onUnreadCountChange} />);

    await screen.findByText('Nova reserva online');
    await user.click(screen.getByRole('button', { name: /marcar todas como lidas/i }));

    expect(notificationsApi.markAllRead).toHaveBeenCalled();
    await waitFor(() => expect(onUnreadCountChange).toHaveBeenCalledWith(0));
  });
});
