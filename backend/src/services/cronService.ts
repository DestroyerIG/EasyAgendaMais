import cron from 'node-cron';
import { prisma } from '../config/prisma.js';
import logger from '../utils/logger.js';
import { subscriptionRepository } from '../repositories/subscriptionRepository.js';
import { businessSettingsRepository } from '../repositories/businessSettingsRepository.js';

// @ts-ignore — sendWhatsAppMessage is a legacy JS service not yet typed
import { sendWhatsAppMessage } from './whatsapp/index.js';
import { notificationsService } from '../modules/notifications/notifications.service.js';

// Agendamentos gravam `time`/`date` no relógio local do negócio (BR), não UTC.
// Render roda em UTC, então o alvo precisa ser calculado no fuso de negócio.
const REMINDER_TIMEZONE =
  process.env.BUSINESS_TIMEZONE || process.env.APP_TIMEZONE || 'America/Sao_Paulo';

const clockInTz = (d: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(d);
  const h = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const m = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${h}:${m}`;
};

const dateInTz = (d: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const mo = parts.find((p) => p.type === 'month')?.value ?? '01';
  const da = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${mo}-${da}`;
};

export const runReminderJob = async (now: Date = new Date()): Promise<void> => {
  try {
    logger.debug('Verificando lembretes...');

    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const targetClock = clockInTz(twoHoursFromNow, REMINDER_TIMEZONE);
    const targetDate = new Date(dateInTz(twoHoursFromNow, REMINDER_TIMEZONE));
    const targetTimeDate = new Date(`1970-01-01T${targetClock}:00`);
    const targetTimePlus10 = new Date(targetTimeDate.getTime() + 10 * 60 * 1000);

    const appointments = await prisma.appointment.findMany({
      where: {
        date: targetDate,
        time: {
          gte: targetTimeDate,
          lte: targetTimePlus10,
        },
        status: 'confirmado',
        reminderSent: false,
      },
      include: {
        client: { select: { phone: true, name: true } },
        service: { select: { name: true } },
        professional: { select: { name: true } },
      },
    });

    // Uma consulta de configuração por negócio, não por agendamento.
    const remindersEnabledByBusiness = new Map<string, boolean>();

    const remindersEnabled = async (businessId: string): Promise<boolean> => {
      const cached = remindersEnabledByBusiness.get(businessId);
      if (cached !== undefined) return cached;

      const settings = await businessSettingsRepository.findByBusinessId(businessId);
      const enabled = settings ? (settings as { whatsappReminders?: unknown }).whatsappReminders !== false : true;

      remindersEnabledByBusiness.set(businessId, enabled);
      return enabled;
    };

    for (const appointment of appointments) {
      if (!(await remindersEnabled(appointment.businessId))) {
        logger.debug({ businessId: appointment.businessId }, 'Lembretes por WhatsApp desligados; pulando');
        continue;
      }

      const config = await prisma.whatsappBotConfig.findFirst({
        where: { businessId: appointment.businessId },
        select: { reminderMessage: true },
      });

      let template =
        '⏰ Lembrete!\n\nOlá {nome_cliente}!\n\nSeu horário é daqui a 2 horas:\n📋 {servico}\n👤 Profissional: {profissional}\n⏰ {horario}\n\nTe esperamos!';

      if (config?.reminderMessage) template = config.reminderMessage;

      const timeStr = appointment.time.toISOString().substring(11, 16);
      const message = template
        .replace(/{nome_cliente}/g, appointment.client.name)
        .replace(/{servico}/g, appointment.service.name)
        .replace(/{profissional}/g, appointment.professional.name)
        .replace(/{horario}/g, timeStr);

      const sent = await sendWhatsAppMessage(appointment.client.phone, message, {
        businessId: appointment.businessId,
      });

      if (sent) {
        await prisma.appointment.update({
          where: { id: appointment.id },
          data: { reminderSent: true },
        });
        logger.info({ phone: appointment.client.phone }, 'Lembrete enviado');
      }
    }
  } catch (error) {
    logger.error({ err: error }, 'Erro ao enviar lembretes');
  }
};

export const expirePendingAppointments = async (now: Date = new Date()): Promise<number> => {
  const toExpire = await prisma.appointment.findMany({
    where: {
      status: 'aguardando_pagamento',
      expiresAt: { lt: now },
    },
    select: {
      id: true,
      businessId: true,
      client: { select: { name: true } },
      service: { select: { name: true } },
    },
  });

  if (toExpire.length === 0) return 0;

  await prisma.appointment.updateMany({
    where: { id: { in: toExpire.map((a) => a.id) } },
    data: { status: 'cancelado' },
  });

  await Promise.all(
    toExpire.map((a) =>
      notificationsService.notify(a.businessId, {
        type: 'reserva_expirada',
        title: 'Reserva expirada sem pagamento',
        description: `${a.client.name} · ${a.service.name}`,
      })
    )
  );

  return toExpire.length;
};

export const startReminderCron = (): void => {
  cron.schedule('*/10 * * * *', () => {
    void runReminderJob();
  });

  cron.schedule('15 * * * *', async () => {
    try {
      const { expiredCount, businessIds } = await subscriptionRepository.expireOneTimeSubscriptions();

      if (expiredCount > 0) {
        logger.info({ expiredCount, businessIds }, 'Assinaturas one-time marcadas como inadimplentes automaticamente');
      }
    } catch (error) {
      logger.error({ err: error }, 'Erro ao expirar assinaturas one-time');
    }
  });

  cron.schedule('0 3 * * *', async () => {
    try {
      const expired = await prisma.$executeRaw`
        UPDATE businesses
        SET subscription_status = 'incomplete'
        WHERE subscription_status = 'trialing'
          AND subscription_current_period_end < NOW()
          AND provider_subscription_id IS NULL
          AND stripe_subscription_id IS NULL
      `;
      if (expired > 0) {
        logger.info({ expiredCount: expired }, 'Trials gratuitos expirados');
      }
    } catch (error) {
      logger.error({ err: error }, 'Erro ao expirar trials gratuitos');
    }
  });

  cron.schedule('*/5 * * * *', async () => {
    try {
      const count = await expirePendingAppointments();
      if (count > 0) {
        logger.info({ count }, 'Reservas públicas expiradas canceladas automaticamente');
      }
    } catch (error) {
      logger.error({ err: error }, 'Erro ao expirar reservas públicas pendentes');
    }
  });

  logger.info('Cron de lembretes iniciado');
};
