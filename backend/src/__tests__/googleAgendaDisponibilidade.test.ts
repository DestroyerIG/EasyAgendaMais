import { vi, describe, it, beforeEach, expect } from 'vitest';

// Os cálculos de horário livre juntam a pausa da profissional e o ocupado do Google Agenda.

vi.mock('../config/prisma.js', () => ({ prisma: {} }));
vi.mock('../utils/logger.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const gerar = vi.hoisted(() => vi.fn(() => ['09:00']));
vi.mock('../services/scheduleSettingsService.js', () => ({
  generateAvailableTimeSlots: gerar,
  getBusinessScheduleSettings: vi.fn(async () => ({ timezone: 'America/Sao_Paulo', slotIntervalMinutes: 30 })),
}));
const google = vi.hoisted(() => ({ bloqueiosDoDia: vi.fn(), sincronizarSaida: vi.fn() }));
vi.mock('../modules/googleAgenda/googleAgenda.service.js', () => ({ googleAgendaService: google }));
const apptRepo = vi.hoisted(() => ({ getServiceDetails: vi.fn(), getBookedSlots: vi.fn(), getProfessionalBreak: vi.fn() }));
vi.mock('../modules/appointments/appointments.repository.js', () => ({ appointmentsPrismaRepository: apptRepo }));
const pubRepo = vi.hoisted(() => ({
  findBusinessBySlug: vi.fn(), findServiceForBusiness: vi.fn(), findProfessionalForBusiness: vi.fn(),
}));
vi.mock('../modules/publicBooking/publicBooking.repository.js', () => ({ publicBookingRepository: pubRepo }));

const { appointmentsService } = await import('../modules/appointments/appointments.service.js');
const { publicBookingService } = await import('../modules/publicBooking/publicBooking.service.js');

const PAUSA = { start: '12:00', end: '13:00' };
const GOOGLE = [{ start: '15:00', end: '16:00' }];

describe('disponibilidade com o Google Agenda', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apptRepo.getBookedSlots.mockResolvedValue([]);
    apptRepo.getProfessionalBreak.mockResolvedValue(PAUSA);
    apptRepo.getServiceDetails.mockResolvedValue({ durationMinutes: 45 });
    google.bloqueiosDoDia.mockResolvedValue(GOOGLE);
  });

  it('painel e bancada: junta pausa e Google', async () => {
    await appointmentsService.getAvailableSlots('b1', { professionalId: 'p1', date: '2099-11-10', serviceId: 's1' } as never);
    expect(google.bloqueiosDoDia).toHaveBeenCalledWith('b1', 'p1', '2099-11-10');
    expect(gerar.mock.calls[0][2]).toMatchObject({ blockedRanges: [PAUSA, ...GOOGLE] });
  });

  it('página pública: junta pausa e Google', async () => {
    pubRepo.findBusinessBySlug.mockResolvedValue({ id: 'b1' });
    pubRepo.findServiceForBusiness.mockResolvedValue({ durationMinutes: 45 });
    pubRepo.findProfessionalForBusiness.mockResolvedValue({ id: 'p1' });
    await publicBookingService.getAvailability('studio', { serviceId: 's1', professionalId: 'p1', date: '2099-11-10' } as never);
    expect(google.bloqueiosDoDia).toHaveBeenCalledWith('b1', 'p1', '2099-11-10');
    expect(gerar.mock.calls[0][2]).toMatchObject({ blockedRanges: [PAUSA, ...GOOGLE] });
  });

  it('painel pode ignorar o Google para encaixar com aviso', async () => {
    await appointmentsService.getAvailableSlots('b1', { professionalId: 'p1', date: '2099-11-10' } as never, { ignorarGoogle: true });
    expect(google.bloqueiosDoDia).not.toHaveBeenCalled();
    expect(gerar.mock.calls[0][2]).toMatchObject({ blockedRanges: [PAUSA] });
  });

  it('sem pausa, só o Google', async () => {
    apptRepo.getProfessionalBreak.mockResolvedValue(null);
    await appointmentsService.getAvailableSlots('b1', { professionalId: 'p1', date: '2099-11-10' } as never);
    expect(gerar.mock.calls[0][2]).toMatchObject({ blockedRanges: GOOGLE });
  });
});
