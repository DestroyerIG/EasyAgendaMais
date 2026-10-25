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
import { automacoesGatilhos } from '../whatsappAutomacoes/gatilhos.service.js';
import { clubeService } from '../clube/clube.service.js';

export const appointmentsService = {
  async getDetails(id: string, businessId: string) {
    const appointment = await appointmentsPrismaRepository.findById(id, businessId);
    if (!appointment) throw new NotFoundError('Agendamento');
    const [visitas, notas] = await Promise.all([
      appointmentsPrismaRepository.findClientVisits(appointment.clientId, businessId, appointment.date),
      appointmentsPrismaRepository.findClientNotes(appointment.clientId, businessId),
    ]);
    const DIA = 24 * 60 * 60 * 1000;
    const anoAtual = new Date().getFullYear();
    const intervalos = visitas.slice(0, -1).map((v, i) => Math.round((v.date.getTime() - visitas[i + 1].date.getTime()) / DIA));
    const ultima = visitas[0];
    return {
      appointment,
      client_stats: {
        visits_this_year: visitas.filter((v) => v.date.getUTCFullYear() === anoAtual).length,
        average_cycle_days: intervalos.length ? Math.round(intervalos.reduce((a, b) => a + b, 0) / intervalos.length) : null,
        last_visit_days_ago: ultima ? Math.round((appointment.date.getTime() - ultima.date.getTime()) / DIA) : null,
        last_visit_professional: ultima?.professional.name ?? null,
        is_recurring: visitas.length >= 2,
      },
      client_notes: notas,
    };
  },

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
      await sendWhatsAppMessage(appointment.client.phone, message, { businessId, origin: 'pix_recibo' });
      await notificationsService.notify(businessId, {
        type: 'pagamento_confirmado',
        title: 'Pagamento confirmado',
        description: `${appointment.client.name} · ${appointment.service.name}`,
      });
    }

    // Clube/pacote com "falta debita": a falta consome a sessão ("faltou" é terminal, não há estorno).
    if (newStatus === 'faltou') {
      await clubeService.aoFaltar(businessId, id)
        .catch((err) => logger.warn({ err, appointmentId: id }, 'Débito da falta no clube falhou'));
    }

    if (newStatus === 'cancelado') {
      void automacoesGatilhos.aoCancelar(businessId, id)
        .catch((err) => logger.warn({ err, appointmentId: id }, 'Gatilho da lista de espera falhou'));
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
    void automacoesGatilhos.aoCancelar(businessId, id)
      .catch((err) => logger.warn({ err, appointmentId: id }, 'Gatilho da lista de espera falhou'));
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

    const pausa = await appointmentsPrismaRepository.getProfessionalBreak(professionalId, businessId);

    return (generateAvailableTimeSlots as Function)(businessSettings, date, {
      serviceDurationMinutes: duration,
      bookedTimes,
      blockedRanges: pausa ? [pausa] : [],
    });
  },

  async getPendingPayment(businessId: string): Promise<AppointmentWithRelations[]> {
    return appointmentsPrismaRepository.findPendingPayment(businessId);
  },
};
