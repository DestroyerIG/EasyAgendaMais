import { vi, describe, it, expect, beforeEach } from 'vitest';

const mockFindMany = vi.hoisted(() => vi.fn());
const mockUpdate = vi.hoisted(() => vi.fn());
const mockBotConfigFindFirst = vi.hoisted(() => vi.fn());
const mockSendWhatsAppMessage = vi.hoisted(() => vi.fn());
const mockFindSettings = vi.hoisted(() => vi.fn());
const mockAutomacoes = vi.hoisted(() => vi.fn());
const mockOptOut = vi.hoisted(() => vi.fn());

vi.mock('../config/prisma.js', () => ({
  prisma: {
    appointment: { findMany: mockFindMany, update: mockUpdate },
    whatsappBotConfig: { findFirst: mockBotConfigFindFirst },
    whatsappAutomacao: { findMany: mockAutomacoes },
    business: { findUnique: vi.fn().mockResolvedValue({ name: 'Studio', slug: null }) },
    businessSettings: { findUnique: vi.fn().mockResolvedValue({ address: null }) },
    $executeRaw: vi.fn().mockResolvedValue(0),
  },
}));

vi.mock('../utils/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() },
}));

vi.mock('../services/whatsapp/index.js', () => ({
  sendWhatsAppMessage: mockSendWhatsAppMessage,
}));

vi.mock('../repositories/businessSettingsRepository.js', () => ({
  businessSettingsRepository: { findByBusinessId: mockFindSettings },
}));

vi.mock('../modules/whatsappInbox/inbox.recorder.js', () => ({
  inboxRecorder: { estaEmOptOut: mockOptOut },
}));

vi.mock('../repositories/subscriptionRepository.js', () => ({
  subscriptionRepository: { expireOneTimeSubscriptions: vi.fn() },
}));

const { runReminderJob } = await import('../services/cronService.js');

const appointment = {
  id: 'appointment-1',
  businessId: 'tenant-1',
  time: new Date('1970-01-01T14:00:00.000Z'),
  client: { phone: '5583999990000', name: 'Mariana' },
  service: { name: 'Manutenção' },
  professional: { name: 'Paula' },
};

describe('runReminderJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindMany.mockResolvedValue([appointment]);
    mockBotConfigFindFirst.mockResolvedValue(null);
    mockSendWhatsAppMessage.mockResolvedValue(true);
    mockUpdate.mockResolvedValue({});
    mockAutomacoes.mockResolvedValue([]);
    mockOptOut.mockResolvedValue(false);
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

  it('não envia para cliente cujo consentimento mais recente é revogação', async () => {
    mockFindSettings.mockResolvedValue({ whatsappReminders: true });
    mockFindMany.mockResolvedValue([
      { ...appointment, client: { ...appointment.client, consents: [{ granted: false, revokedAt: new Date() }] } },
      { ...appointment, id: 'appointment-2', client: { ...appointment.client, consents: [{ granted: true, revokedAt: new Date() }] } },
      { ...appointment, id: 'appointment-3', client: { ...appointment.client, consents: [{ granted: true, revokedAt: null }] } },
      { ...appointment, id: 'appointment-4', client: { ...appointment.client, consents: [] } },
    ]);

    await runReminderJob(new Date('2026-09-17T12:00:00.000Z'));

    expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(2);
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'appointment-1' } }));
    expect(mockUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'appointment-2' } }));
  });

  it('usa o texto padrão do lembrete de 2h com os dados do agendamento', async () => {
    mockFindSettings.mockResolvedValue({ whatsappReminders: true });

    await runReminderJob(new Date('2026-09-17T12:00:00.000Z'));

    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      '5583999990000',
      '⏰ Lembrete!\n\nOlá Mariana!\n\nSeu horário é daqui a 2 horas:\n📋 Manutenção\n👤 Profissional: Paula\n⏰ 14:00\n\nTe esperamos!',
      { businessId: 'tenant-1', origin: 'lembrete' },
    );
  });

  it('usa o texto personalizado do legado', async () => {
    mockFindSettings.mockResolvedValue({ whatsappReminders: true });
    mockBotConfigFindFirst.mockResolvedValue({ reminderMessage: 'Oi {nome_cliente}, {servico} às {horario}' });

    await runReminderJob(new Date('2026-09-17T12:00:00.000Z'));

    expect(mockSendWhatsAppMessage.mock.calls[0][1]).toBe('Oi Mariana, Manutenção às 14:00');
  });

  it('não envia para quem está em opt-out', async () => {
    mockFindSettings.mockResolvedValue({ whatsappReminders: true });
    mockOptOut.mockResolvedValue(true);

    await runReminderJob(new Date('2026-09-17T12:00:00.000Z'));

    expect(mockOptOut).toHaveBeenCalledWith('tenant-1', '5583999990000');
    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('regra salva desligada ganha do legado ligado', async () => {
    mockFindSettings.mockResolvedValue({ whatsappReminders: true });
    mockAutomacoes.mockResolvedValue([{ regra: 'lembrete', ativa: false, texto: null, config: {} }]);

    await runReminderJob(new Date('2026-09-17T12:00:00.000Z'));

    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('negócio no modo véspera não recebe o lembrete de 2h', async () => {
    mockFindSettings.mockResolvedValue({ whatsappReminders: true });
    mockAutomacoes.mockImplementation(async (args: { where: { businessId?: string } }) =>
      args.where.businessId ? [{ regra: 'lembrete', ativa: true, texto: null, config: { modo: 'vespera', hora: '18:00' } }] : []);

    await runReminderJob(new Date('2026-09-17T12:00:00.000Z'));

    expect(mockSendWhatsAppMessage).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
