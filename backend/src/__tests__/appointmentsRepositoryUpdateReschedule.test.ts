import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '../config/prisma.js';
import { appointmentsPrismaRepository } from '../modules/appointments/appointments.repository.js';

vi.mock('../config/prisma.js', () => ({
  prisma: {
    appointment: { findFirst: vi.fn(), update: vi.fn() },
  },
}));

const findFirst = prisma.appointment.findFirst as unknown as ReturnType<typeof vi.fn>;
const update = prisma.appointment.update as unknown as ReturnType<typeof vi.fn>;

const ZERADOS = { reminderSent: false, confirmationSentAt: null, clientConfirmedAt: null };

describe('appointmentsPrismaRepository.update — remarcar reinicia lembrete e confirmacao', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findFirst.mockResolvedValue({
      id: 'apt-1',
      date: new Date('2026-04-20T00:00:00Z'),
      time: new Date('1970-01-01T10:00:00Z'),
    });
    update.mockResolvedValue({ id: 'apt-1' });
  });

  it('data diferente zera lembrete e confirmacao', async () => {
    await appointmentsPrismaRepository.update('apt-1', 'biz-1', { date: '2026-04-21' });
    expect(update.mock.calls[0][0].data).toMatchObject(ZERADOS);
  });

  it('hora diferente zera lembrete e confirmacao', async () => {
    await appointmentsPrismaRepository.update('apt-1', 'biz-1', { time: '11:00' });
    expect(update.mock.calls[0][0].data).toMatchObject(ZERADOS);
  });

  it('mesma data e hora nao zera', async () => {
    await appointmentsPrismaRepository.update('apt-1', 'biz-1', { date: '2026-04-20', time: '10:00' });
    const data = update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('reminderSent');
    expect(data).not.toHaveProperty('confirmationSentAt');
    expect(data).not.toHaveProperty('clientConfirmedAt');
  });

  it.each(['10:00', '10:00:00'])('mesma hora em HH:mm e HH:mm:ss (%s) nao zera', async (time) => {
    await appointmentsPrismaRepository.update('apt-1', 'biz-1', { time });
    expect(update.mock.calls[0][0].data).not.toHaveProperty('reminderSent');
  });

  it('hora diferente em HH:mm:ss zera', async () => {
    await appointmentsPrismaRepository.update('apt-1', 'biz-1', { time: '11:30:00' });
    expect(update.mock.calls[0][0].data).toMatchObject(ZERADOS);
  });

  it('leitura sem data e hora (campos ausentes) nao lanca e zera', async () => {
    findFirst.mockResolvedValue({ id: 'apt-1' });
    await expect(appointmentsPrismaRepository.update('apt-1', 'biz-1', { time: '17:30' })).resolves.toBeDefined();
    expect(update.mock.calls[0][0].data).toMatchObject(ZERADOS);
  });

  it('data ou hora invalidas nao lancam na comparacao', async () => {
    findFirst.mockResolvedValue({ id: 'apt-1', date: new Date('x'), time: null });
    await expect(
      appointmentsPrismaRepository.update('apt-1', 'biz-1', { date: '2026-04-21', time: '10:00' }),
    ).resolves.toBeDefined();
  });

  it('agendamento nao encontrado na leitura devolve null sem atualizar', async () => {
    findFirst.mockResolvedValue(null);
    await expect(appointmentsPrismaRepository.update('apt-1', 'biz-1', { time: '11:00' })).resolves.toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it('mudanca sem data nem hora nao zera', async () => {
    await appointmentsPrismaRepository.update('apt-1', 'biz-1', { serviceId: 'svc-2' });
    const data = update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('reminderSent');
    expect(data.serviceId).toBe('svc-2');
  });
});
