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

const todayInTimezone = (timeZone: string): string => {
  // en-CA formata como YYYY-MM-DD, comparável lexicograficamente com `date`.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
};

/**
 * Carrega as configurações de agenda do negócio, rejeita datas anteriores a hoje
 * (no fuso do negócio) e calcula os horários livres do profissional naquele dia.
 */
const computeAvailableSlots = async (
  businessId: string,
  professionalId: string,
  date: string,
  serviceDurationMinutes: number
): Promise<string[]> => {
  const businessSettings = await getBusinessScheduleSettings(businessId);

  const timeZone = businessSettings?.timezone || 'America/Sao_Paulo';
  if (date < todayInTimezone(timeZone)) {
    throw new ValidationError('Não é possível agendar em uma data que já passou');
  }

  const bookedTimes = await appointmentsPrismaRepository.getBookedSlots(businessId, professionalId, date);

  return generateAvailableTimeSlots(businessSettings, date, {
    serviceDurationMinutes,
    bookedTimes,
  });
};

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
      galleryPhotos: business.galleryPhotos,
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

    return computeAvailableSlots(business.id, query.professionalId, query.date, service.durationMinutes);
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

    const availableSlots = await computeAvailableSlots(
      business.id, data.professionalId, data.date, service.durationMinutes
    );
    if (!availableSlots.includes(data.time)) {
      throw new ValidationError('Horário indisponível para este serviço e profissional');
    }

    const client = await publicBookingRepository.findOrCreateClient(business.id, data.clientName, data.clientPhone);

    // Calcula o depósito e monta o payload Pix ANTES de criar a reserva: buildPixPayload
    // pode lançar (ex.: amount <= 0), e não queremos uma reserva "fantasma" em
    // aguardando_pagamento (segurando o horário por 15min) se o payload falhar.
    const depositAmount = calcDeposit(Number(service.price), Number(service.depositPercentage));

    const pixPayload = buildPixPayload({
      pixKey: business.pixKey,
      pixKeyType: business.pixKeyType as never,
      merchantName: business.name,
      merchantCity: 'BRASIL',
      amount: depositAmount,
      description: `Sinal - ${service.name}`,
    });

    const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000);

    // Checagem de conflito + criação dentro de uma única transação com advisory lock
    // por profissional+dia: duas requisições simultâneas para o mesmo horário são
    // serializadas, e a segunda enxerga a reserva da primeira e recebe 409.
    const appointment = await publicBookingRepository.withProfessionalDayLock(
      data.professionalId, data.date, async (tx) => {
        const conflict = await appointmentsPrismaRepository.hasConflict(
          business.id, data.professionalId, data.date, `${data.time}:00`, undefined, tx
        );
        if (conflict) throw new ConflictError('Este horário acabou de ser reservado por outra pessoa');

        return publicBookingRepository.createPendingAppointment({
          businessId: business.id,
          clientId: client.id,
          professionalId: data.professionalId,
          serviceId: data.serviceId,
          date: data.date,
          time: data.time,
          expiresAt,
        }, tx);
      }
    );

    logger.info({ appointmentId: appointment.id, businessId: business.id }, 'Reserva pública criada, aguardando pagamento');

    return {
      appointmentId: appointment.id,
      depositAmount,
      pixPayload,
      expiresAt: expiresAt.toISOString(),
    };
  },
};
