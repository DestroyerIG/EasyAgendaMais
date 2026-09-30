import { NotFoundError, ValidationError, ConflictError } from '../../utils/errors.js';
import { publicBookingRepository } from './publicBooking.repository.js';
import { appointmentsPrismaRepository } from '../appointments/appointments.repository.js';
import { generateAvailableTimeSlots, getBusinessScheduleSettings } from '../../services/scheduleSettingsService.js';
import { buildPixPayload } from '../../utils/pixPayload.js';
import logger from '../../utils/logger.js';
import type { CreatePublicAppointmentInput, GetPublicAvailabilityQuery, Storefront } from './publicBooking.types.js';

const HOLD_MINUTES = 15;

const calcDeposit = (price: number, depositPercentage: number): number =>
  Math.round(price * (depositPercentage / 100) * 100) / 100;

export const publicBookingService = {
  async getStorefront(slug: string): Promise<Storefront> {
    const business = await publicBookingRepository.findBusinessBySlug(slug);
    if (!business) throw new NotFoundError('Página');

    const services = await publicBookingRepository.findEligibleServices(business.id);

    return {
      businessId: business.id,
      name: business.name,
      logoUrl: business.logoUrl,
      brandColor: business.brandColor,
      services: services.map((s) => ({
        id: s.id,
        name: s.name,
        price: Number(s.price),
        durationMinutes: s.durationMinutes,
        depositPercentage: Number(s.depositPercentage),
        depositAmount: calcDeposit(Number(s.price), Number(s.depositPercentage)),
      })),
    };
  },

  async getProfessionals(slug: string) {
    const business = await publicBookingRepository.findBusinessBySlug(slug);
    if (!business) throw new NotFoundError('Página');
    return publicBookingRepository.findProfessionalsForService(business.id);
  },

  async getAvailability(slug: string, query: GetPublicAvailabilityQuery) {
    const business = await publicBookingRepository.findBusinessBySlug(slug);
    if (!business) throw new NotFoundError('Página');

    const service = await publicBookingRepository.findServiceForBusiness(business.id, query.serviceId);
    if (!service) throw new ValidationError('Serviço indisponível para este negócio');

    const professional = await publicBookingRepository.findProfessionalForBusiness(business.id, query.professionalId);
    if (!professional) throw new ValidationError('Profissional indisponível para este negócio');

    const businessSettings = await getBusinessScheduleSettings(business.id);
    const bookedTimes = await appointmentsPrismaRepository.getBookedSlots(
      business.id, query.professionalId, query.date
    );

    return generateAvailableTimeSlots(businessSettings, query.date, {
      serviceDurationMinutes: service.durationMinutes,
      bookedTimes,
    });
  },

  async createPendingAppointment(slug: string, data: CreatePublicAppointmentInput) {
    const business = await publicBookingRepository.findBusinessBySlug(slug);
    if (!business) throw new NotFoundError('Página');
    if (!business.pixKey || !business.pixKeyType) {
      throw new ValidationError('Este negócio ainda não configurou o recebimento de sinal via Pix');
    }

    const service = await publicBookingRepository.findServiceForBusiness(business.id, data.serviceId);
    if (!service) throw new ValidationError('Serviço indisponível para este negócio');

    const professional = await publicBookingRepository.findProfessionalForBusiness(business.id, data.professionalId);
    if (!professional) throw new ValidationError('Profissional indisponível para este negócio');

    const conflict = await appointmentsPrismaRepository.hasConflict(
      business.id, data.professionalId, data.date, `${data.time}:00`
    );
    if (conflict) throw new ConflictError('Este horário acabou de ser reservado por outra pessoa');

    const client = await publicBookingRepository.findOrCreateClient(business.id, data.clientName, data.clientPhone);

    const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000);
    const appointment = await publicBookingRepository.createPendingAppointment({
      businessId: business.id,
      clientId: client.id,
      professionalId: data.professionalId,
      serviceId: data.serviceId,
      date: data.date,
      time: data.time,
      expiresAt,
    });

    const depositAmount = calcDeposit(Number(service.price), Number(service.depositPercentage));

    const pixPayload = buildPixPayload({
      pixKey: business.pixKey,
      pixKeyType: business.pixKeyType as never,
      merchantName: business.name,
      merchantCity: 'BRASIL',
      amount: depositAmount,
      description: `Sinal - ${appointment.service.name}`,
    });

    logger.info({ appointmentId: appointment.id, businessId: business.id }, 'Reserva pública criada, aguardando pagamento');

    return {
      appointment,
      pixPayload,
      depositAmount,
      expiresAt: expiresAt.toISOString(),
    };
  },
};
