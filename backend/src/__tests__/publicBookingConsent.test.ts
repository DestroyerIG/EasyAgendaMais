import { describe, it, expect, vi, beforeEach } from 'vitest';

const repo = vi.hoisted(() => ({
  findBusinessBySlug: vi.fn(),
  findServiceForBusiness: vi.fn(),
  findProfessionalForBusiness: vi.fn(),
  findOrCreateClient: vi.fn(),
  createPendingAppointment: vi.fn(),
  withProfessionalDayLock: vi.fn(),
  registrarConsentimento: vi.fn(),
}));
vi.mock('../modules/publicBooking/publicBooking.repository.js', () => ({ publicBookingRepository: repo }));
vi.mock('../modules/appointments/appointments.repository.js', () => ({
  appointmentsPrismaRepository: {
    hasConflict: vi.fn().mockResolvedValue(false),
    getBookedSlots: vi.fn().mockResolvedValue([]),
    getProfessionalBreak: vi.fn().mockResolvedValue(null),
  },
}));
vi.mock('../services/scheduleSettingsService.js', () => ({
  getBusinessScheduleSettings: vi.fn().mockResolvedValue({}),
  generateAvailableTimeSlots: vi.fn().mockReturnValue(['14:00']),
}));
vi.mock('../modules/notifications/notifications.service.js', () => ({
  notificationsService: { notify: vi.fn().mockResolvedValue(undefined) },
}));

const { publicBookingService } = await import('../modules/publicBooking/publicBooking.service.js');
const { CreatePublicAppointmentSchema } = await import('../modules/publicBooking/publicBooking.types.js');

const INPUT = {
  serviceId: '11111111-1111-4111-8111-111111111111',
  professionalId: '22222222-2222-4222-8222-222222222222',
  date: '2099-10-24',
  time: '14:00',
  clientName: 'Mariana',
  clientPhone: '83999990000',
};

beforeEach(() => {
  vi.clearAllMocks();
  repo.findBusinessBySlug.mockResolvedValue({ id: 'biz-1', name: 'Studio Aurora', pixKey: 'studio@aurora.com', pixKeyType: 'email' });
  repo.findServiceForBusiness.mockResolvedValue({ id: INPUT.serviceId, name: 'Corte', price: 100, durationMinutes: 60, depositPercentage: 30 });
  repo.findProfessionalForBusiness.mockResolvedValue({ id: INPUT.professionalId });
  repo.findOrCreateClient.mockResolvedValue({ id: 'client-1' });
  repo.withProfessionalDayLock.mockImplementation(async (_p: string, _d: string, fn: (tx: unknown) => Promise<unknown>) => fn({}));
  repo.createPendingAppointment.mockResolvedValue({ id: 'appt-1' });
  repo.registrarConsentimento.mockResolvedValue(undefined);
});

describe('consentimento de WhatsApp na reserva pública', () => {
  it('o schema aceita whatsappConsent opcional', () => {
    expect(CreatePublicAppointmentSchema.parse({ ...INPUT, whatsappConsent: true }).whatsappConsent).toBe(true);
    expect(CreatePublicAppointmentSchema.parse(INPUT).whatsappConsent).toBeUndefined();
  });

  it('whatsappConsent: true grava consentimento com canal publico para a cliente', async () => {
    const r = await publicBookingService.createPendingAppointment('studio-aurora', { ...INPUT, whatsappConsent: true });
    expect(r.appointmentId).toBe('appt-1');
    expect(repo.registrarConsentimento).toHaveBeenCalledTimes(1);
    expect(repo.registrarConsentimento).toHaveBeenCalledWith({ businessId: 'biz-1', clientId: 'client-1' });
    // grava depois de criar a reserva
    expect(repo.registrarConsentimento.mock.invocationCallOrder[0])
      .toBeGreaterThan(repo.createPendingAppointment.mock.invocationCallOrder[0]);
  });

  it('whatsappConsent: false ou ausente não grava nada', async () => {
    await publicBookingService.createPendingAppointment('studio-aurora', { ...INPUT, whatsappConsent: false });
    await publicBookingService.createPendingAppointment('studio-aurora', INPUT);
    expect(repo.registrarConsentimento).not.toHaveBeenCalled();
  });

  it('falha ao gravar o consentimento não derruba a reserva', async () => {
    repo.registrarConsentimento.mockRejectedValue(new Error('db fora'));
    const r = await publicBookingService.createPendingAppointment('studio-aurora', { ...INPUT, whatsappConsent: true });
    expect(r.appointmentId).toBe('appt-1');
  });
});
