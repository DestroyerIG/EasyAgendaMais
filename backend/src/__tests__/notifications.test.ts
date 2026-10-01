import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notificationsService } from '../modules/notifications/notifications.service.js';
import { notificationsRepository } from '../modules/notifications/notifications.repository.js';
import { NotFoundError } from '../utils/errors.js';

vi.mock('../modules/notifications/notifications.repository.js', () => ({
  notificationsRepository: {
    create: vi.fn(),
    findByBusiness: vi.fn(),
    countUnread: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}));

describe('notificationsService.list', () => {
  beforeEach(() => vi.clearAllMocks());

  it('converte createdAt para ISO string e repassa os demais campos', async () => {
    const createdAt = new Date('2026-10-01T12:00:00.000Z');
    (notificationsRepository.findByBusiness as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'n1', type: 'nova_reserva', title: 'Nova reserva online', description: 'Mariana · Corte', link: null, read: false, createdAt },
    ]);

    const result = await notificationsService.list('biz-1');

    expect(result).toEqual([
      { id: 'n1', type: 'nova_reserva', title: 'Nova reserva online', description: 'Mariana · Corte', link: null, read: false, createdAt: createdAt.toISOString() },
    ]);
    expect(notificationsRepository.findByBusiness).toHaveBeenCalledWith('biz-1', undefined);
  });

  it('repassa o limite quando informado', async () => {
    (notificationsRepository.findByBusiness as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await notificationsService.list('biz-1', 5);
    expect(notificationsRepository.findByBusiness).toHaveBeenCalledWith('biz-1', 5);
  });
});

describe('notificationsService.unreadCount', () => {
  beforeEach(() => vi.clearAllMocks());

  it('repassa a contagem do repositório', async () => {
    (notificationsRepository.countUnread as ReturnType<typeof vi.fn>).mockResolvedValue(4);
    await expect(notificationsService.unreadCount('biz-1')).resolves.toBe(4);
  });
});

describe('notificationsService.markRead', () => {
  beforeEach(() => vi.clearAllMocks());

  it('marca como lida quando a notificação pertence ao negócio', async () => {
    (notificationsRepository.markRead as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    await expect(notificationsService.markRead('n1', 'biz-1')).resolves.toBeUndefined();
    expect(notificationsRepository.markRead).toHaveBeenCalledWith('n1', 'biz-1');
  });

  it('lança NotFoundError quando a notificação não existe ou é de outro negócio', async () => {
    (notificationsRepository.markRead as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    await expect(notificationsService.markRead('n1', 'biz-1')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('notificationsService.markAllRead', () => {
  beforeEach(() => vi.clearAllMocks());

  it('repassa a contagem de notificações marcadas', async () => {
    (notificationsRepository.markAllRead as ReturnType<typeof vi.fn>).mockResolvedValue(7);
    await expect(notificationsService.markAllRead('biz-1')).resolves.toBe(7);
  });
});

describe('notificationsService.notify', () => {
  beforeEach(() => vi.clearAllMocks());

  it('cria a notificação no repositório', async () => {
    (notificationsRepository.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    await notificationsService.notify('biz-1', { type: 'nova_reserva', title: 'Nova reserva online' });
    expect(notificationsRepository.create).toHaveBeenCalledWith('biz-1', { type: 'nova_reserva', title: 'Nova reserva online' });
  });

  it('nunca lança: uma falha no repositório não deve derrubar quem chamou notify', async () => {
    (notificationsRepository.create as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db fora do ar'));
    await expect(
      notificationsService.notify('biz-1', { type: 'nova_reserva', title: 'Nova reserva online' })
    ).resolves.toBeUndefined();
  });
});
