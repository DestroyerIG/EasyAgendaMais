import { describe, it, expect, vi } from 'vitest';

vi.mock('../repositories/businessSettingsRepository.js', () => ({ businessSettingsRepository: {} }));
vi.mock('../utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const { generateAvailableTimeSlots } = await import('../services/scheduleSettingsService.js');
const { createProfessionalSchema } = await import('../validators/schemas/professionalSchemas.js');

const settings = {
  openingTime: '09:00', closingTime: '15:00', slotIntervalMinutes: 30,
  allowWalkins: true, autoConfirmAppointments: false, timezone: 'America/Sao_Paulo',
  diasAbertos: { seg: true, ter: true, qua: true, qui: true, sex: true, sab: true, dom: true },
};
const amanha = '2026-10-14';
const agora = new Date('2026-10-13T08:00:00-03:00');

describe('intervalo de almoço bloqueia horários', () => {
  it('nenhum horário cruza o almoço de 12:00 às 13:00', () => {
    const slots = generateAvailableTimeSlots(settings, amanha, {
      serviceDurationMinutes: 60, currentDate: agora,
      blockedRanges: [{ start: '12:00', end: '13:00' }],
    });
    expect(slots).toContain('11:00');
    expect(slots).not.toContain('11:30');
    expect(slots).not.toContain('12:00');
    expect(slots).not.toContain('12:30');
    expect(slots).toContain('13:00');
  });

  it('sem intervalo, tudo continua como antes', () => {
    const slots = generateAvailableTimeSlots(settings, amanha, { serviceDurationMinutes: 60, currentDate: agora });
    expect(slots).toContain('12:00');
  });
});

describe('validação do cadastro da profissional', () => {
  it('aceita intervalo e comissão própria', () => {
    const r = createProfessionalSchema.safeParse({ name: 'Camila', breakStart: '12:00', breakEnd: '13:00', commissionServicePct: 50, commissionProductPct: 20 });
    expect(r.success).toBe(true);
  });

  it('recusa intervalo com fim antes do início', () => {
    const r = createProfessionalSchema.safeParse({ name: 'Camila', breakStart: '13:00', breakEnd: '12:00' });
    expect(r.success).toBe(false);
  });

  it('recusa intervalo pela metade', () => {
    const r = createProfessionalSchema.safeParse({ name: 'Camila', breakStart: '12:00' });
    expect(r.success).toBe(false);
  });

  it('recusa comissão acima de 100%', () => {
    const r = createProfessionalSchema.safeParse({ name: 'Camila', commissionServicePct: 120 });
    expect(r.success).toBe(false);
  });
});
