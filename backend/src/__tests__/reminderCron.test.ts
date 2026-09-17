import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockFindMany = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockBotConfigFindFirst = vi.hoisted(() => vi.fn());
const mockSendWhatsAppMessage = vi.hoisted(() => vi.fn());
const mockFindSettings = vi.hoisted(() => vi.fn());

vi.mock('../config/prisma.js', () => ({
  prisma: {
    appointment: { findMany: mockFindMany, update: mockUpdate },
    whatsappBotConfig: { findFirst: mockBotConfigFindFirst },
    $executeRaw: vi.fn().mockResolvedValue(0),
  },
}));

vi.mock('../utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
}));

vi.mock('../services/whatsapp/index.js', () => ({
  sendWhatsAppMessage: mockSendWhatsAppMessage,
}));

vi.mock('../repositories/barbershopSettingsRepository.js', () => ({
  barbershopSettingsRepository: { findByBarbershopId: mockFindSettings },
}));

vi.mock('../repositories/subscriptionRepository.js', () => ({
  subscriptionRepository: { expireOneTimeSubscriptions: vi.fn() },
}));

const { runReminderJob } = await import('../services/cronService.js');

const appointment = {
  id: 'appointment-1',
  barbershopId: 'tenant-1',
  time: new Date('1970-01-01T14:00:00.000Z'),
  client: { phone: '5583999990000', name: 'Mariana' },
  service: { name: 'Manutenção' },
  barber: { name: 'Paula' },
};

describe('runReminderJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([appointment]);
    mockBotConfigFindFirst.mockResolvedValue(null);
    mockSendWhatsAppMessage.mockResolvedValue(true);
    mockUpdate.mockResolvedValue({});
  });

  it('envia o lembrete quando o negócio mantém lembretes por WhatsApp ligados', async () => {
    mockFindSettings.mockResolvedValue({ whatsappReminders: true });

    await runReminderJob(new Date('2026-09-17T12:00:00.000Z'));

    expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'appointment-1' },
      data: { reminderSent: true },
    });
  });

  it('não envia nada quando o negócio desligou os lembretes por WhatsApp', async () => {
    mockFindSettings.mockResolvedValue({ whatsappReminders: false });

    await runReminderJob(new Date('2026-09-17T12:00:00.000Z'));

    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('mantém os lembretes ligados quando o negócio não tem linha de configuração', async () => {
    mockFindSettings.mockResolvedValue(null);

    await runReminderJob(new Date('2026-09-17T12:00:00.000Z'));

    expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'appointment-1' },
      data: { reminderSent: true },
    });
  });

  it('consulta a configuração uma vez por negócio', async () => {
    mockFindSettings.mockResolvedValue({ whatsappReminders: true });
    mockFindMany.mockResolvedValue([appointment, { ...appointment, id: 'appointment-2' }]);

    await runReminderJob(new Date('2026-09-17T12:00:00.000Z'));

    expect(mockFindSettings).toHaveBeenCalledTimes(1);
    expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(2);
  });
});
