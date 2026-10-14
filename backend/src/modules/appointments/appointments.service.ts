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
// @ts-ignore — sendWhatsAppMessage é um serviço JS legado ainda não tipado
import { sendWhatsAppMessage } from '../../services/whatsapp/index.js';
import { notificationsService } from '../notifications/notifications.service.js';

export const appointmentsService = {
  async getAll(
    businessId: string,
    filters: GetAppointmentsQuery
  ): Promise<AppointmentWithRelations[]> {
    return appointmentsPrismaRepository.findAll(businessId, filters);
  },

  async create(
    businessId: string,
    data: CreateAppointmentInput,
    opts: { source?: 'painel' | 'whatsapp' } = {}
  ): Promise<AppointmentWithRelations> {
    const ownership = await appointmentsPrismaRepository.validateOwnership(businessId, data);
    const errors: string[] = [];
    if (!ownership.clientOk) errors.push('Cliente não pertence a este negócio');
    if (!ownership.professionalOk) errors.push('Profissional não pertence a este negócio ou está inativo');
    if (!ownership.serviceOk) errors.push('Serviço não pertence a este negócio ou está inativo');
    if (errors.length > 0) throw new ForbiddenError(errors.join('. '));

    const time = data.time.length === 5 ? `${data.time}:00` : data.time;
    const conflict = await appointmentsPrismaRepository.hasConflict(
      businessId, data.professionalId, data.date, time
    );
    if (conflict) throw new ConflictError('Horário já ocupado para este profissional');

    const result = await appointmentsPrismaRepository.create({ ...data, businessId, source: opts.source ?? 'painel' });
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

    if (newStatus === 'concluido') {
      throw new ConflictError('Feche a comanda para concluir o atendimento');
    }

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

    // Compare-and-set: se o status mudou entre a leitura acima e este UPDATE (ex.: o
    // cron cancelou a reserva expirada) ou a reserva já expirou, nada é alterado.
    const extra =
      newStatus === 'em_atendimento' ? { startedAt: new Date() }
      : newStatus === 'confirmado' && currentStatus === 'em_atendimento' ? { startedAt: null }
      : newStatus === 'faltou' ? { finishedAt: new Date() }
      : {};
    const result = await appointmentsPrismaRepository.updateStatus(id, businessId, newStatus, currentStatus, extra);
    if (!result) {
      throw new ConflictError(
        currentStatus === 'aguardando_pagamento'
          ? 'Esta reserva já expirou ou teve seu status alterado'
          : 'Este agendamento teve seu status alterado. Atualize a página e tente novamente'
      );
    }

    if (newStatus === 'confirmado' && currentStatus === 'aguardando_pagamento') {
      const message = `Olá ${appointment.client.name}! Seu sinal foi confirmado e seu horário está garantido. Te esperamos!`;
      await sendWhatsAppMessage(appointment.client.phone, message, { businessId });
      await notificationsService.notify(businessId, {
        type: 'pagamento_confirmado',
        title: 'Pagamento confirmado',
        description: `${appointment.client.name} · ${appointment.service.name}`,
      });
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
      if (data.clientId && !ownership.clientOk) errors.push('Cliente não pertence a este negócio');
      if (data.professionalId && !ownership.professionalOk) errors.push('Profissional não pertence a este negócio ou está inativo');
      if (data.serviceId && !ownership.serviceOk) errors.push('Serviço não pertence a este negócio ou está inativo');
      if (errors.length > 0) throw new ForbiddenError(errors.join('. '));
    }

    if (data.date && data.time && data.professionalId) {
      const time = data.time.length === 5 ? `${data.time}:00` : data.time;
      const conflict = await appointmentsPrismaRepository.hasConflict(
        businessId, data.professionalId, data.date, time, id
      );
      if (conflict) throw new ConflictError('Horário já ocupado para este profissional');
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

  async getPendingPayment(businessId: string): Promise<AppointmentWithRelations[]> {
    return appointmentsPrismaRepository.findPendingPayment(businessId);
  },
};
