import logger from '../../utils/logger.js';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  ForbiddenError,
} from '../../utils/errors.js';
import { appointmentsPrismaRepository } from './appointments.repository.js';
import { googleAgendaService } from '../googleAgenda/googleAgenda.service.js';
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
import { automacoesGatilhos } from '../whatsappAutomacoes/gatilhos.service.js';
import { clubeService } from '../clube/clube.service.js';
import { avisarProfissional, avisarSinalConfirmado, dataBr, horaDe, primeiroNome } from './sinalConfirmado.js';
import { recebimentosRepository } from '../recebimentos/recebimentos.repository.js';

/** Cancelar com sinal pago lembra de devolver. Nunca derruba o cancelamento. */
function lembrarDevolucao(businessId: string, appointmentId: string): void {
  void recebimentosRepository.lembrarDevolucaoAoCancelar(businessId, appointmentId)
    .catch((err) => logger.warn({ err, appointmentId }, 'Lembrete de devolver o sinal falhou'));
}

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
    if (result.status === 'confirmado') {
      avisarProfissional(result, 'Novo agendamento', () => `${primeiroNome(result.client.name)} · ${result.service.name} · ${dataBr(result.date)} às ${horaDe(result.time)}`);
    }
    void googleAgendaService.sincronizarSaida({ appointmentId: result.id });
    return result;
  },

  async updateStatus(
    id: string,
    businessId: string,
    newStatus: AppointmentStatus,
    opts: { porProfissional?: boolean } = {}
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
      // O sincronismo da agenda fica no fim de updateStatus (vale para todas as transições).
      await avisarSinalConfirmado(result, { sincronizar: false });
    }

    // Clube/pacote com "falta debita": a falta consome a sessão ("faltou" é terminal, não há estorno).
    if (newStatus === 'faltou') {
      await clubeService.aoFaltar(businessId, id)
        .catch((err) => logger.warn({ err, appointmentId: id }, 'Débito da falta no clube falhou'));
    }

    // Quem cancelou pelo app já sabe; a recepção cancelando avisa a profissional.
    if (newStatus === 'cancelado' && !opts.porProfissional) {
      avisarProfissional(result, 'Agendamento cancelado', () => `${primeiroNome(result.client.name)} · ${dataBr(result.date)} às ${horaDe(result.time)}`);
    }

    if (newStatus === 'cancelado') {
      void automacoesGatilhos.aoCancelar(businessId, id)
        .catch((err) => logger.warn({ err, appointmentId: id }, 'Gatilho da lista de espera falhou'));
      lembrarDevolucao(businessId, id);
    }

    logger.info({ appointmentId: id, from: currentStatus, to: newStatus }, 'Status atualizado');
    void googleAgendaService.sincronizarSaida({ appointmentId: id });
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

    const antes = await appointmentsPrismaRepository.findById(id, businessId);
    const result = await appointmentsPrismaRepository.update(id, businessId, data);
    if (!result) throw new NotFoundError('Agendamento (ou não pode ser editado)');
    if (antes) {
      const resumo = () => `${primeiroNome(result.client.name)} · ${dataBr(result.date)} às ${horaDe(result.time)}`;
      if (antes.professionalId !== result.professionalId) {
        avisarProfissional(antes, 'Agendamento passou para outra profissional', () => `${primeiroNome(antes.client.name)} · ${dataBr(antes.date)} às ${horaDe(antes.time)}`);
        avisarProfissional(result, 'Novo agendamento', resumo);
      } else if (antes.date?.getTime() !== result.date?.getTime() || antes.time?.getTime() !== result.time?.getTime()) {
        avisarProfissional(result, 'Agendamento reagendado', resumo);
      }
    }
    void googleAgendaService.sincronizarSaida({ appointmentId: id });
    return result;
  },

  async delete(id: string, businessId: string): Promise<void> {
    const deleted = await appointmentsPrismaRepository.softDelete(id, businessId);
    if (!deleted) throw new NotFoundError('Agendamento');
    void automacoesGatilhos.aoCancelar(businessId, id)
      .catch((err) => logger.warn({ err, appointmentId: id }, 'Gatilho da lista de espera falhou'));
    lembrarDevolucao(businessId, id);
    logger.info({ appointmentId: id, businessId }, 'Agendamento cancelado');
  },

  /**
   * `ignorarGoogle`: o painel recebe também os horários ocupados no Google Agenda, que a tela
   * marca com aviso (a recepção pode encaixar). A bancada e a página pública não ignoram.
   */
  async getAvailableSlots(
    businessId: string,
    query: GetAvailableSlotsQuery,
    opts: { ignorarGoogle?: boolean } = {}
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
    const doGoogle = opts.ignorarGoogle ? [] : await googleAgendaService.bloqueiosDoDia(businessId, professionalId, date);

    return (generateAvailableTimeSlots as Function)(businessSettings, date, {
      serviceDurationMinutes: duration,
      bookedTimes,
      blockedRanges: [...(pausa ? [pausa] : []), ...doGoogle],
    });
  },

  async getPendingPayment(businessId: string): Promise<AppointmentWithRelations[]> {
    return appointmentsPrismaRepository.findPendingPayment(businessId);
  },
};
