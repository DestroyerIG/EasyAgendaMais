import { vi, describe, it, expect } from 'vitest';

const schedule = vi.hoisted(() => vi.fn());
vi.mock('node-cron', () => ({ default: { schedule } }));
vi.mock('../config/prisma.js', () => ({ prisma: {} }));
vi.mock('../utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fatal: vi.fn() } }));
vi.mock('../services/whatsapp/index.js', () => ({ sendWhatsAppMessage: vi.fn() }));
vi.mock('../repositories/businessSettingsRepository.js', () => ({ businessSettingsRepository: { findByBusinessId: vi.fn() } }));
vi.mock('../repositories/subscriptionRepository.js', () => ({ subscriptionRepository: { expireOneTimeSubscriptions: vi.fn() } }));

const { startReminderCron } = await import('../services/cronService.js');

describe('rotina da fila de envios', () => {
  it('roda por minuto sem sobreposição', () => {
    startReminderCron();
    const chamada = schedule.mock.calls.find((c) => c[0] === '* * * * *');
    expect(chamada).toBeTruthy();
    expect(chamada![2]).toMatchObject({ noOverlap: true });
  });
});
