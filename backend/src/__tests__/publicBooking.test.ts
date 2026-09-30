import { describe, it, expect, vi, beforeEach } from 'vitest';
import { publicBookingService } from '../modules/publicBooking/publicBooking.service.js';
import { publicBookingRepository } from '../modules/publicBooking/publicBooking.repository.js';
import { appointmentsPrismaRepository } from '../modules/appointments/appointments.repository.js';
import { getBusinessScheduleSettings, generateAvailableTimeSlots } from '../services/scheduleSettingsService.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';

vi.mock('../modules/publicBooking/publicBooking.repository.js', () => ({
  publicBookingRepository: {
    findBusinessBySlug: vi.fn(),
    findEligibleServices: vi.fn(),
    findProfessionalsForService: vi.fn(),
    findServiceForBusiness: vi.fn(),
    findProfessionalForBusiness: vi.fn(),
    findOrCreateClient: vi.fn(),
    createPendingAppointment: vi.fn(),
  },
}));

vi.mock('../modules/appointments/appointments.repository.js', () => ({
  appointmentsPrismaRepository: {
    hasConflict: vi.fn(),
    getBookedSlots: vi.fn(),
  },
}));

vi.mock('../services/scheduleSettingsService.js', () => ({
  getBusinessScheduleSettings: vi.fn(),
  generateAvailableTimeSlots: vi.fn(),
}));

const BUSINESS = {
  id: 'biz-1',
  name: 'Studio Aurora',
  pixKey: 'studio@aurora.com',
  pixKeyType: 'email',
};

const SERVICE = {
  id: 'srv-1',
  name: 'Corte',
  price: 100,
  durationMinutes: 60,
  depositPercentage: 30,
};

const PROFESSIONAL = { id: 'prof-1' };

const VALID_INPUT = {
  serviceId: 'srv-1',
  professionalId: 'prof-1',
  date: '2026-10-24',
  time: '14:00',
  clientName: 'Mariana',
  clientPhone: '83999990000',
};

const mockHappyPathDependencies = (): void => {
  (publicBookingRepository.findBusinessBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(BUSINESS);
  (publicBookingRepository.findServiceForBusiness as ReturnType<typeof vi.fn>).mockResolvedValue(SERVICE);
  (publicBookingRepository.findProfessionalForBusiness as ReturnType<typeof vi.fn>).mockResolvedValue(PROFESSIONAL);
  (getBusinessScheduleSettings as ReturnType<typeof vi.fn>).mockResolvedValue({});
  (appointmentsPrismaRepository.getBookedSlots as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  (generateAvailableTimeSlots as ReturnType<typeof vi.fn>).mockReturnValue(['14:00', '14:30']);
  (appointmentsPrismaRepository.hasConflict as ReturnType<typeof vi.fn>).mockResolvedValue(false);
  (publicBookingRepository.findOrCreateClient as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'client-1' });
  (publicBookingRepository.createPendingAppointment as ReturnType<typeof vi.fn>).mockResolvedValue({
    id: 'appt-1',
    client: { name: 'Mariana', phone: '83999990000' },
    service: { name: 'Corte', price: 100 },
  });
};

describe('publicBookingService.getStorefront', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lança NotFoundError quando o slug não existe', async () => {
    (publicBookingRepository.findBusinessBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(publicBookingService.getStorefront('inexistente')).rejects.toThrow(NotFoundError);
  });

  it('retorna nome, logo, cor e serviços elegíveis do negócio', async () => {
    (publicBookingRepository.findBusinessBySlug as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'biz-1',
      name: 'Studio Aurora',
      logoUrl: 'https://x/logo.png',
      brandColor: '#FF7A00',
    });
    (publicBookingRepository.findEligibleServices as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'srv-1', name: 'Manutenção', price: 130, durationMinutes: 105, depositPercentage: 30 },
    ]);

    const result = await publicBookingService.getStorefront('studio-aurora');

    expect(result.name).toBe('Studio Aurora');
    expect(result.services).toHaveLength(1);
    expect(result.services[0].depositAmount).toBe(39); // 30% de 130
  });
});

describe('publicBookingService.createPendingAppointment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejeita serviço que não pertence ao negócio do slug', async () => {
    (publicBookingRepository.findBusinessBySlug as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'biz-1' });
    (publicBookingRepository.findServiceForBusiness as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      publicBookingService.createPendingAppointment('studio-aurora', {
        serviceId: 'srv-de-outro-negocio',
        professionalId: 'prof-1',
        date: '2026-10-24',
        time: '14:00',
        clientName: 'Mariana',
        clientPhone: '83999990000',
      })
    ).rejects.toThrow(ValidationError);
  });

  it('cria a reserva e retorna { appointmentId, depositAmount, pixPayload, expiresAt }', async () => {
    mockHappyPathDependencies();

    const result = await publicBookingService.createPendingAppointment('studio-aurora', VALID_INPUT);

    expect(result).toEqual({
      appointmentId: 'appt-1',
      depositAmount: 30, // 30% de 100
      pixPayload: expect.any(String),
      expiresAt: expect.any(String),
    });
    expect(Object.keys(result).sort()).toEqual(['appointmentId', 'depositAmount', 'expiresAt', 'pixPayload']);
    // A reserva só deve ser criada DEPOIS que o payload Pix foi montado com sucesso —
    // sem isso, uma falha em buildPixPayload deixaria uma reserva "fantasma" segurando
    // o horário por 15min.
    expect(publicBookingRepository.createPendingAppointment).toHaveBeenCalledTimes(1);
  });

  it('rejeita horário que não está na lista de slots disponíveis (fora do expediente, dia fechado, ou grid incompatível)', async () => {
    mockHappyPathDependencies();
    (generateAvailableTimeSlots as ReturnType<typeof vi.fn>).mockReturnValue(['09:00', '09:30']); // 14:00 não está disponível

    await expect(
      publicBookingService.createPendingAppointment('studio-aurora', VALID_INPUT)
    ).rejects.toThrow(ValidationError);

    expect(publicBookingRepository.createPendingAppointment).not.toHaveBeenCalled();
    expect(appointmentsPrismaRepository.hasConflict).not.toHaveBeenCalled();
  });

  it('rejeita serviço com depositPercentage 0% (repositório filtra com gt:0, tratado aqui como indisponível)', async () => {
    (publicBookingRepository.findBusinessBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(BUSINESS);
    // findServiceForBusiness usa `depositPercentage: { gt: 0 }` no Prisma — um serviço
    // configurado com 0% de sinal nunca é retornado; simulado aqui via null.
    (publicBookingRepository.findServiceForBusiness as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      publicBookingService.createPendingAppointment('studio-aurora', { ...VALID_INPUT, serviceId: 'srv-sinal-zero' })
    ).rejects.toThrow(ValidationError);

    expect(publicBookingRepository.createPendingAppointment).not.toHaveBeenCalled();
  });
});
