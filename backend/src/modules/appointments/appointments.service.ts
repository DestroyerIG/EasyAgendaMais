import { prisma } from '../../config/prisma.js';
import logger from '../../utils/logger.js';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  ForbiddenError,
} from '../../utils/errors.js';
import { appointmentsPrismaRepository } from './appointments.repository.js';
import { generateAvailableTimeSlots, getBusinessScheduleSettings } from '../../services/scheduleSettingsService.js';
import type {
  CreateAppointmentInput,
  UpdateAppointmentInput,
  GetAppointmentsQuery,
  GetAvailableSlotsQuery,
  AppointmentWithRelations,
  VALID_STATUS_TRANSITIONS,
} from './appointments.types.js';
import { VALID_STATUS_TRANSITIONS as TRANSITIONS } from './appointments.types.js';
import type { AppointmentStatus } from '../../types/domain.js';

export const appointmentsService = {
  async getAll(
    businessId: string,
    filters: GetAppointmentsQuery
  ): Promise<AppointmentWithRelations[]> {
    return appointmentsPrismaRepository.findAll(businessId, filters);
  },

  async create(
    businessId: string,
    data: CreateAppointmentInput
  ): Promise<AppointmentWithRelations> {
    const ownership = await appointmentsPrismaRepository.validateOwnership(businessId, data);
    const errors: string[] = [];
    if (!ownership.clientOk) errors.push('Cliente não pertence a esta barbearia');
    if (!ownership.professionalOk) errors.push('Barbeiro não pertence a esta barbearia ou está inativo');
    if (!ownership.serviceOk) errors.push('Serviço não pertence a esta barbearia ou está inativo');
    if (errors.length > 0) throw new ForbiddenError(errors.join('. '));

    const time = data.time.length === 5 ? `${data.time}:00` : data.time;
    const conflict = await appointmentsPrismaRepository.hasConflict(
      businessId, data.professionalId, data.date, time
    );
    if (conflict) throw new ConflictError('Horário já ocupado para este barbeiro');

    const result = await appointmentsPrismaRepository.create({ ...data, businessId });
    logger.info({ appointmentId: result.id, businessId }, 'Agendamento criado');
    return result;
  },

  async updateStatus(
    id: string,
    businessId: string,
    newStatus: AppointmentStatus
  ): Promise<AppointmentWithRelations> {
    const appointment = await appointmentsPrismaRepository.findById(id, businessId);
    if (!appointment) throw new NotFoundError('Agendamento');

    const currentStatus = appointment.status;
    const allowed = TRANSITIONS[currentStatus];

    if (!allowed.includes(newStatus)) {
      throw new ValidationError(
        `Transição de status inválida: ${currentStatus} → ${newStatus}`,
        [
          `Transições permitidas de '${currentStatus}': ${
            allowed.length ? allowed.join(', ') : 'nenhuma (estado terminal)'
          }`,
        ]
      );
    }

    const result = await appointmentsPrismaRepository.updateStatus(id, businessId, newStatus);
    if (!result) throw new NotFoundError('Agendamento');

    if (newStatus === 'concluido') {
      const service = await appointmentsPrismaRepository.getServiceDetails(
        appointment.serviceId,
        businessId
      );
      if (service) {
        await prisma.$transaction([
          prisma.earning.create({
            data: {
              businessId,
              appointmentId: id,
              amount: service.price,
              date: appointment.date,
            },
          }),
        ]);
      }
    }

    logger.info({ appointmentId: id, from: currentStatus, to: newStatus }, 'Status atualizado');
    return result;
  },

  async update(
    id: string,
    businessId: string,
    data: UpdateAppointmentInput
  ): Promise<AppointmentWithRelations> {
    if (data.clientId || data.professionalId || data.serviceId) {
      const ownership = await appointmentsPrismaRepository.validateOwnership(businessId, {
        clientId: data.clientId ?? '',
        professionalId: data.professionalId ?? '',
        serviceId: data.serviceId ?? '',
      });
      const errors: string[] = [];
      if (data.clientId && !ownership.clientOk) errors.push('Cliente não pertence a esta barbearia');
      if (data.professionalId && !ownership.professionalOk) errors.push('Barbeiro não pertence a esta barbearia ou está inativo');
      if (data.serviceId && !ownership.serviceOk) errors.push('Serviço não pertence a esta barbearia ou está inativo');
      if (errors.length > 0) throw new ForbiddenError(errors.join('. '));
    }

    if (data.date && data.time && data.professionalId) {
      const time = data.time.length === 5 ? `${data.time}:00` : data.time;
      const conflict = await appointmentsPrismaRepository.hasConflict(
        businessId, data.professionalId, data.date, time, id
      );
      if (conflict) throw new ConflictError('Horário já ocupado para este barbeiro');
    }

    const result = await appointmentsPrismaRepository.update(id, businessId, data);
    if (!result) throw new NotFoundError('Agendamento (ou não pode ser editado)');
    return result;
  },

  async delete(id: string, businessId: string): Promise<void> {
    const deleted = await appointmentsPrismaRepository.softDelete(id, businessId);
    if (!deleted) throw new NotFoundError('Agendamento');
    logger.info({ appointmentId: id, businessId }, 'Agendamento cancelado');
  },

  async getAvailableSlots(
    businessId: string,
    query: GetAvailableSlotsQuery
  ): Promise<unknown> {
    const { professionalId, date, serviceId } = query;

    const businessSettings = await getBusinessScheduleSettings(businessId);
    let duration: number = (businessSettings as { slotIntervalMinutes?: number }).slotIntervalMinutes ?? 60;

    if (serviceId) {
      const service = await appointmentsPrismaRepository.getServiceDetails(serviceId, businessId);
      if (service) duration = service.durationMinutes;
    }

    const bookedTimes = await appointmentsPrismaRepository.getBookedSlots(
      businessId, professionalId, date
    );

    return (generateAvailableTimeSlots as Function)(businessSettings, date, {
      serviceDurationMinutes: duration,
      bookedTimes,
    });
  },
};
