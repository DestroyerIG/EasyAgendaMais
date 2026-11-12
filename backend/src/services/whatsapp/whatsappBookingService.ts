/**
 * whatsappBookingService.ts — CORRIGIDO
 *
 * FIX Bug 5 (reagendamento): handleConfirmReschedule usava new Date(today)
 * e setDate() sem fuso local, gerando datas com offset UTC incorreto.
 * Corrigido via generateNextDays() que usa localToDateStr().
 */

import { Prisma } from '@prisma/client';
import logger from '../../utils/logger.js';
import { prisma } from '../../config/prisma.js';
import { STEPS, BotConfig } from './whatsappConstants.js';
import { updateSession } from './whatsappSessionService.js';
import { formatMessage } from './whatsappMessageService.js';
import { goBackToMainMenu, normalizeChoice, formatarTexto } from './whatsappFlowService.js';
import { formatTimeHm } from './utils/timeUtils.js';
import { automacoesGatilhos } from '../../modules/whatsappAutomacoes/gatilhos.service.js';
import { recebimentosRepository } from '../../modules/recebimentos/recebimentos.repository.js';

// ==================== UTILITÁRIO DE DATA (FIX Bug 5) ====================

const localToDateStr = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const generateNextDays = (count = 7): string[] => {
  const today = new Date();
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    return localToDateStr(date);
  });
};

const formatDateBR = (dateStr: string, options: Intl.DateTimeFormatOptions = {}): string => {
  const parts = dateStr.split('-').map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  return new Date(year, month - 1, day).toLocaleDateString('pt-BR', options);
};

// ── Appointment row shapes from raw SQL ───────────────────────────────────────

export interface AppointmentListRow {
  id: string;
  date: Date;
  time: string;
  status: string;
  service_id?: string;
  professional_id?: string;
}

/** Id fictício do cliente e do agendamento de exemplo do simulador (não é UUID: nunca vai ao banco). */
export const ID_SIMULADOR = 'simulador';

/** Agendamento fictício que o simulador mostra em cancelar e remarcar: amanhã às 14:00. */
export const agendamentoExemplo = (agora: Date): AppointmentListRow => ({
  id: ID_SIMULADOR,
  date: new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1),
  time: '14:00',
  status: 'confirmado',
});

interface BookingMessageResult {
  message: string;
}

/** O exemplo não tem serviço nem profissional: usa os primeiros ativos para a escolha de data achar horários. */
const agendamentoExemploCompleto = async (businessId: string): Promise<AppointmentListRow[]> => {
  const [servico, profissional] = await Promise.all([
    prisma.service.findFirst({ where: { businessId, active: true, available: true }, select: { id: true }, orderBy: { name: 'asc' } }),
    prisma.professional.findFirst({ where: { businessId, active: true }, select: { id: true }, orderBy: { name: 'asc' } }),
  ]);
  return [{
    ...agendamentoExemplo(new Date()),
    ...(servico ? { service_id: servico.id } : {}),
    ...(profissional ? { professional_id: profissional.id } : {}),
  }];
};

// ==================== CANCELAMENTO ====================

export const handleCancelAppointment = async (
  phone: string,
  businessId: string,
  config: BotConfig,
  simulado: boolean,
): Promise<BookingMessageResult> => {
  try {
    // No simulador o número de teste pode ser cliente real: lista só o exemplo.
    const appointments = simulado ? [agendamentoExemplo(new Date())] : await prisma.$queryRaw<AppointmentListRow[]>(Prisma.sql`
      SELECT id, date, time, status FROM appointments
       WHERE business_id = ${businessId}::uuid
         AND client_id = (
           SELECT id FROM clients WHERE phone = ${phone} AND business_id = ${businessId}::uuid
         )
         AND status = 'confirmado'
         AND date >= CURRENT_DATE
       ORDER BY date DESC LIMIT 5
    `);

    if (!appointments?.length) {
      return { message: await formatarTexto(config.cancel_no_appointments_message, businessId) };
    }

    let message = await formatarTexto(config.cancel_list_message, businessId) + '\n\n';
    appointments.forEach((appointment, index) => {
      const date = new Date(appointment.date).toLocaleDateString('pt-BR');
      message += `*${index + 1}* • 📅 ${date} às ${formatTimeHm(appointment.time)}\n`;
    });
    message += '\n' + await formatarTexto(config.cancel_list_hint, businessId);

    await updateSession(phone, businessId, STEPS.CONFIRM_CANCEL, { appointments });
    return { message };
  } catch (error) {
    logger.error({ err: error }, 'Erro ao listar agendamentos para cancelamento');
    return { message: await formatarTexto(config.list_error_message, businessId) };
  }
};

export const handleConfirmCancel = async (
  phone: string,
  choice: string,
  businessId: string,
  data: Record<string, unknown>,
  config: BotConfig,
  simulado: boolean,
): Promise<BookingMessageResult> => {
  if (choice === '0' || choice.toLowerCase() === 'menu') {
    return goBackToMainMenu(phone, businessId);
  }

  const appointmentIndex = parseInt(choice) - 1;
  const appointments = data.appointments as AppointmentListRow[] | undefined;

  if (!appointments || appointmentIndex < 0 || appointmentIndex >= appointments.length) {
    return { message: await formatarTexto(config.invalid_list_choice_message, businessId) };
  }

  const selectedAppointment = appointments[appointmentIndex];
  if (!selectedAppointment) {
    return { message: await formatarTexto(config.invalid_list_choice_message, businessId) };
  }
  return cancelarAgendamento(phone, businessId, selectedAppointment.id, config, simulado);
};

/** Cancela o agendamento, dispara o gatilho da lista de espera e volta ao menu. Em simulação não grava nada. */
const cancelarAgendamento = async (
  phone: string,
  businessId: string,
  appointmentId: string,
  config: BotConfig,
  simulado: boolean,
): Promise<BookingMessageResult> => {
  try {
    if (!simulado) {
      // O agendamento vem da sessão e pode já ter mudado: só cancela se ainda estiver confirmado.
      const { count } = await prisma.appointment.updateMany({
        where: { id: appointmentId, businessId, status: 'confirmado' },
        data: { status: 'cancelado' },
      });
      if (count === 0) {
        const menu = await goBackToMainMenu(phone, businessId);
        return { message: await formatarTexto(config.appointment_inactive_message, businessId) + '\n\n' + menu.message };
      }
      void automacoesGatilhos.aoCancelar(businessId, appointmentId)
        .catch((err) => logger.warn({ err, appointmentId }, 'Gatilho da lista de espera falhou'));
      // Cancelar com sinal pago lembra quem administra de devolver; nunca derruba o cancelamento.
      void recebimentosRepository.lembrarDevolucaoAoCancelar(businessId, appointmentId)
        .catch((err) => logger.warn({ err, appointmentId }, 'Lembrete de devolver o sinal falhou'));
    }
    const mainMenu = await goBackToMainMenu(phone, businessId);
    return { message: await formatarTexto(config.cancel_success_message, businessId) + '\n\n' + mainMenu.message };
  } catch (error) {
    logger.error({ err: error }, 'Erro ao cancelar agendamento');
    return { message: await formatarTexto(config.cancel_failed_message, businessId) };
  }
};

// ==================== REAGENDAMENTO ====================

export const handleRescheduleAppointment = async (
  phone: string,
  businessId: string,
  config: BotConfig,
  simulado: boolean,
): Promise<BookingMessageResult> => {
  try {
    const appointments = simulado ? await agendamentoExemploCompleto(businessId) : await prisma.$queryRaw<AppointmentListRow[]>(Prisma.sql`
      SELECT id, date, time, service_id, professional_id FROM appointments
       WHERE business_id = ${businessId}::uuid
         AND client_id = (
           SELECT id FROM clients WHERE phone = ${phone} AND business_id = ${businessId}::uuid
         )
         AND status = 'confirmado'
         AND date >= CURRENT_DATE
       ORDER BY date DESC LIMIT 5
    `);

    if (!appointments?.length) {
      return { message: await formatarTexto(config.reschedule_no_appointments_message, businessId) };
    }

    let message = await formatarTexto(config.reschedule_list_message, businessId) + '\n\n';
    appointments.forEach((appointment, index) => {
      const date = new Date(appointment.date).toLocaleDateString('pt-BR');
      message += `*${index + 1}* • 📅 ${date} às ${formatTimeHm(appointment.time)}\n`;
    });
    message += '\n' + await formatarTexto(config.reschedule_list_hint, businessId);

    await updateSession(phone, businessId, STEPS.CONFIRM_RESCHEDULE, { appointments });
    return { message };
  } catch (error) {
    logger.error({ err: error }, 'Erro ao listar agendamentos para reagendamento');
    return { message: await formatarTexto(config.list_error_message, businessId) };
  }
};

export const handleConfirmReschedule = async (
  phone: string,
  choice: string,
  businessId: string,
  data: Record<string, unknown>,
  config: BotConfig,
): Promise<BookingMessageResult> => {
  if (choice === '0' || choice.toLowerCase() === 'menu') {
    return goBackToMainMenu(phone, businessId);
  }

  const appointmentIndex = parseInt(choice) - 1;
  const appointments = data.appointments as AppointmentListRow[] | undefined;

  if (!appointments || appointmentIndex < 0 || appointmentIndex >= appointments.length) {
    return { message: await formatarTexto(config.invalid_list_choice_message, businessId) };
  }

  const appointment = appointments[appointmentIndex];
  if (!appointment) {
    return { message: await formatarTexto(config.invalid_list_choice_message, businessId) };
  }
  return iniciarRemarcacao(phone, businessId, appointment, config);
};

/** Grava o agendamento escolhido na sessão e pergunta a nova data. */
const iniciarRemarcacao = async (
  phone: string,
  businessId: string,
  appointment: AppointmentListRow,
  config: BotConfig,
): Promise<BookingMessageResult> => {
  // A escolha de data usa a duração do serviço e a profissional da sessão; sem eles o fluxo não acha horários.
  const servico = appointment.service_id
    ? await prisma.service.findFirst({
        where: { id: appointment.service_id, businessId },
        select: { name: true, durationMinutes: true },
      })
    : null;
  const profissional = appointment.professional_id
    ? await prisma.professional.findFirst({
        where: { id: appointment.professional_id, businessId },
        select: { name: true },
      })
    : null;

  const newData: Record<string, unknown> = {
    rescheduleAppointmentId: appointment.id,
    serviceId: appointment.service_id,
    serviceName: servico?.name ?? '',
    serviceDuration: servico?.durationMinutes,
    professionalId: appointment.professional_id,
    professionalName: profissional?.name ?? '',
  };

  await updateSession(phone, businessId, STEPS.CHOOSE_DATE, newData);

  /**
   * FIX Bug 5 — reagendamento: o código original usava new Date(today) com
   * date.setDate() e depois toLocaleDateString(), que misturava UTC com local.
   * generateNextDays() garante strings YYYY-MM-DD no fuso local.
   */
  const dates = generateNextDays(7);

  let message = await formatarTexto(config.new_date_title, businessId) + '\n\n';
  dates.forEach((dateStr, index) => {
    const day = formatDateBR(dateStr, { weekday: 'short', day: '2-digit', month: '2-digit' });
    message += `*${index + 1}* • 📅 ${day}\n`;
  });

  // Persiste availableDates para que handleChooseDateStep encontre as datas corretas
  await updateSession(phone, businessId, STEPS.CHOOSE_DATE, {
    ...newData,
    availableDates: dates,
  });

  return { message };
};

// ==================== REMARCAR OU CANCELAR ====================

const montarListaManage = async (appointments: AppointmentListRow[], config: BotConfig, businessId: string): Promise<string> => {
  let message = await formatarTexto(config.manage_list_message, businessId) + '\n\n';
  appointments.forEach((appointment, index) => {
    const date = new Date(appointment.date).toLocaleDateString('pt-BR');
    message += `*${index + 1}* • 📅 ${date} às ${formatTimeHm(appointment.time)}\n`;
  });
  message += '\n*0* • ↩️ Voltar ao menu';
  return message;
};

const textoAcaoManage = (appointment: AppointmentListRow, config: BotConfig, businessId: string): Promise<string> =>
  formatarTexto(config.manage_action_message, businessId, {
    dateFormatted: new Date(appointment.date).toLocaleDateString('pt-BR'),
    time: formatTimeHm(appointment.time),
  });

const perguntarAcaoManage = async (
  phone: string,
  businessId: string,
  appointment: AppointmentListRow,
  config: BotConfig,
): Promise<BookingMessageResult> => {
  await updateSession(phone, businessId, STEPS.MANAGE_ACTION, { appointment });
  return { message: await textoAcaoManage(appointment, config, businessId) };
};

export const handleManageAppointments = async (
  phone: string,
  businessId: string,
  config: BotConfig,
  simulado: boolean,
): Promise<BookingMessageResult> => {
  try {
    // No simulador o número de teste pode ser cliente real: lista só o exemplo.
    const appointments = simulado ? await agendamentoExemploCompleto(businessId) : await prisma.$queryRaw<AppointmentListRow[]>(Prisma.sql`
      SELECT id, date, time, service_id, professional_id FROM appointments
       WHERE business_id = ${businessId}::uuid
         AND client_id = (
           SELECT id FROM clients WHERE phone = ${phone} AND business_id = ${businessId}::uuid
         )
         AND status = 'confirmado'
         AND date >= CURRENT_DATE
       ORDER BY date ASC, time ASC LIMIT 5
    `);

    const primeiro = appointments?.[0];
    if (!primeiro) {
      const menu = await goBackToMainMenu(phone, businessId);
      return { message: await formatarTexto(config.manage_no_appointments_message, businessId) + '\n\n' + menu.message };
    }
    if (appointments.length === 1) {
      return await perguntarAcaoManage(phone, businessId, primeiro, config);
    }

    await updateSession(phone, businessId, STEPS.MANAGE_CHOOSE, { appointments });
    return { message: await montarListaManage(appointments, config, businessId) };
  } catch (error) {
    logger.error({ err: error }, 'Erro ao listar agendamentos para remarcar ou cancelar');
    return { message: await formatarTexto(config.list_error_message, businessId) };
  }
};

export const handleManageChoose = async (
  phone: string,
  choice: string,
  businessId: string,
  data: Record<string, unknown>,
  config: BotConfig,
  _simulado: boolean,
): Promise<BookingMessageResult> => {
  const numero = normalizeChoice(choice);
  if (numero === 0 || choice.toLowerCase() === 'menu') {
    return goBackToMainMenu(phone, businessId);
  }

  const appointments = (data.appointments as AppointmentListRow[] | undefined) ?? [];
  const selecionado = numero != null ? appointments[numero - 1] : undefined;
  if (!selecionado) {
    return { message: formatMessage(config.invalid_option_message) + '\n\n' + await montarListaManage(appointments, config, businessId) };
  }
  return perguntarAcaoManage(phone, businessId, selecionado, config);
};

export const handleManageAction = async (
  phone: string,
  choice: string,
  businessId: string,
  data: Record<string, unknown>,
  config: BotConfig,
  simulado: boolean,
): Promise<BookingMessageResult> => {
  const numero = normalizeChoice(choice);
  if (numero === 0 || choice.toLowerCase() === 'menu') {
    return goBackToMainMenu(phone, businessId);
  }

  const appointment = data.appointment as AppointmentListRow | undefined;
  if (!appointment) {
    return goBackToMainMenu(phone, businessId);
  }

  if (numero === 1) return iniciarRemarcacao(phone, businessId, appointment, config);
  if (numero === 2) return cancelarAgendamento(phone, businessId, appointment.id, config, simulado);

  return { message: formatMessage(config.invalid_option_message) + '\n\n' + await textoAcaoManage(appointment, config, businessId) };
};
