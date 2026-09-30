import { describe, it, expect, vi, beforeEach } from 'vitest';
import { publicBookingService } from '../modules/publicBooking/publicBooking.service.js';
import { publicBookingRepository } from '../modules/publicBooking/publicBooking.repository.js';
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
});
