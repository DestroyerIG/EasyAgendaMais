import cron from 'node-cron';
import { prisma } from '../config/prisma.js';
import logger from '../utils/logger.js';
import { avatares } from '../modules/whatsappAvatar/avatar.service.js';
import { subscriptionRepository } from '../repositories/subscriptionRepository.js';

// @ts-ignore — sendWhatsAppMessage is a legacy JS service not yet typed
import { sendWhatsAppMessage } from './whatsapp/index.js';
import { inboxCron } from '../modules/whatsappInbox/inbox.cron.js';
import { planChangeService } from '../modules/billing/planChange.service.js';
import { filaEnvios } from '../modules/whatsappFila/fila.service.js';
import { notificationsService } from '../modules/notifications/notifications.service.js';
import { inboxRecorder } from '../modules/whatsappInbox/inbox.recorder.js';
import { automacoes } from '../modules/whatsappAutomacoes/automacoes.service.js';
import { renderizarTexto } from '../modules/whatsappAutomacoes/automacoes.rules.js';
import { automacoesRotinas, linkMapa } from '../modules/whatsappAutomacoes/rotinas.service.js';
import { rotinasRepository } from '../modules/whatsappAutomacoes/rotinas.repository.js';
import { clubeService } from '../modules/clube/clube.service.js';
import { googleAgendaService } from '../modules/googleAgenda/googleAgenda.service.js';
import { envioAutomaticoLiberado } from '../modules/conta/envioAutomatico.js';

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
        client: {
          select: {
            phone: true,
            name: true,
            consents: {
              where: { kind: 'whatsapp_lembretes' },
              orderBy: { grantedAt: 'desc' },
              take: 1,
              select: { granted: true, revokedAt: true },
            },
          },
        },
        service: { select: { name: true } },
        professional: { select: { name: true } },
      },
    });

    // Uma consulta de regra por negócio, não por agendamento.
    type Lembrete2h = { texto: string; endereco: string | null } | null;
    const regraPorNegocio = new Map<string, Lembrete2h>();

    const regra2h = async (businessId: string): Promise<Lembrete2h> => {
      if (regraPorNegocio.has(businessId)) return regraPorNegocio.get(businessId)!;
      const regra = await automacoes.obter(businessId, 'lembrete');
      const valor = regra.ativa && regra.config.modo === '2h'
        ? { texto: regra.texto, endereco: (await rotinasRepository.negocio(businessId)).endereco }
        : null;
      regraPorNegocio.set(businessId, valor);
      return valor;
    };

    // Contingência: conta bloqueada não manda o lembrete de 2 h; na carência ele segue (compromisso já existente).
    // Sem conseguir ler o estado, o negócio fica de fora nesta rodada (nunca envia às cegas).
    const podeEnviar = (businessId: string) => envioAutomaticoLiberado(businessId, 'lembrete', now);

    for (const appointment of appointments) {
      if (!(await podeEnviar(appointment.businessId))) {
        logger.debug({ businessId: appointment.businessId }, 'Lembrete de 2h: conta fora do ar (ou estado ilegível); pulando');
        continue;
      }
      const regra = await regra2h(appointment.businessId);
      if (!regra) {
        logger.debug({ businessId: appointment.businessId }, 'Lembrete de 2h desligado (ou no modo véspera); pulando');
        continue;
      }

      // Consentimento revogado (registro mais recente) interrompe o lembrete automático.
      // "Não informado" segue recebendo, como antes.
      const ultimoConsentimento = appointment.client.consents?.[0];
      if (ultimoConsentimento && (!ultimoConsentimento.granted || ultimoConsentimento.revokedAt)) {
        logger.debug({ appointmentId: appointment.id }, 'Cliente revogou o consentimento; lembrete não enviado');
        continue;
      }

      if (await inboxRecorder.estaEmOptOut(appointment.businessId, appointment.client.phone)) {
        logger.debug({ appointmentId: appointment.id }, 'Cliente pediu para não receber mensagens; lembrete não enviado');
        continue;
      }

      const nome = appointment.client.name;
      const message = renderizarTexto(regra.texto, {
        nome, nome_cliente: nome, primeiro_nome: nome.trim().split(/\s+/)[0] ?? '',
        servico: appointment.service.name, profissional: appointment.professional.name,
        horario: appointment.time.toISOString().substring(11, 16), data: 'hoje',
        endereco: regra.endereco, link_mapa: linkMapa(regra.endereco),
      });

      const sent = await sendWhatsAppMessage(appointment.client.phone, message, {
        businessId: appointment.businessId,
        origin: 'lembrete',
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

  try {
    const vespera = await automacoesRotinas.lembretesVespera(now);
    if (vespera > 0) logger.info({ vespera }, 'Lembretes da véspera enviados');
  } catch (error) {
    logger.warn({ err: error }, 'Erro ao enviar lembretes da véspera');
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
  // Google Agenda (fase 7): agendamentos para o Google a cada minuto (os dois nunca lançam).
  cron.schedule('* * * * *', async () => {
    await googleAgendaService.sincronizarSaida();
  }, { noOverlap: true });
  // E os compromissos do Google, que bloqueiam horário, a cada 5 minutos.
  cron.schedule('*/5 * * * *', async () => {
    await googleAgendaService.atualizarOcupado();
  }, { noOverlap: true });

  cron.schedule('* * * * *', async () => {
    try {
      await filaEnvios.processar();
    } catch (err) {
      logger.warn({ err }, 'Falha ao processar a fila de envios do WhatsApp');
    }
  }, { noOverlap: true });

  cron.schedule('* * * * *', async () => {
    try {
      await avatares.processar();
    } catch (err) {
      logger.warn({ err }, 'Falha ao atualizar as fotos de perfil do WhatsApp');
    }
  }, { noOverlap: true });

  // noOverlap: a véspera envia em sequência; uma rodada lenta não pode ser repetida pela próxima.
  cron.schedule('*/10 * * * *', async () => {
    try {
      await runReminderJob();
    } catch (err) {
      logger.warn({ err }, 'Falha na rotina de lembretes do WhatsApp');
    }
  }, { noOverlap: true });

  cron.schedule('*/10 * * * *', async () => {
    try {
      await automacoesRotinas.confirmacoes();
    } catch (err) {
      logger.warn({ err }, 'Falha na rotina de confirmação do WhatsApp');
    }
  }, { noOverlap: true });

  cron.schedule('*/15 * * * *', async () => {
    try {
      await automacoesRotinas.radarRetorno();
    } catch (err) {
      logger.warn({ err }, 'Falha no radar de retorno do WhatsApp');
    }
  }, { noOverlap: true });

  cron.schedule('*/15 * * * *', async () => {
    try {
      await automacoesRotinas.aniversarios();
    } catch (err) {
      logger.warn({ err }, 'Falha na rotina de aniversário do WhatsApp');
    }
  }, { noOverlap: true });

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

  // Clube e pacotes: cobrança do ciclo seguinte, atraso, pacotes vencidos e adesões abandonadas.
  cron.schedule('25 * * * *', async () => {
    try {
      const r = await clubeService.rotina();
      if (r.cobrancas > 0 || r.atrasos > 0) logger.info(r, 'Rotina do clube executada');
    } catch (error) {
      logger.error({ err: error }, 'Erro na rotina do clube');
    }
  }, { noOverlap: true });

  // Downgrades agendados cujo período acabou (no cartão, o valor da assinatura já mudou no agendamento).
  cron.schedule('20 * * * *', async () => {
    try {
      const aplicados = await planChangeService.aplicarDowngradesVencidos();
      if (aplicados > 0) {
        logger.info({ aplicados }, 'Downgrades agendados aplicados');
      }
    } catch (error) {
      logger.error({ err: error }, 'Erro ao aplicar downgrades agendados');
    }
  });

  cron.schedule('0 3 * * *', async () => {
    try {
      const expired = await prisma.$executeRaw`
        UPDATE businesses
        SET subscription_status = 'incomplete'
        WHERE subscription_status = 'trialing'
          AND subscription_current_period_end < NOW()
          -- Teste com cartão: quem segue é o Asaas (cobra no fim); só expira se ela cancelou.
          AND (provider_subscription_id IS NULL OR subscription_cancel_at_period_end)
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

  cron.schedule('*/15 * * * *', async () => {
    const voltaram = await inboxCron.voltarAoRoboPorInatividade();
    const finalizadas = await inboxCron.finalizarConversasDoRobo();
    if (voltaram > 0 || finalizadas > 0) {
      logger.info({ voltaram, finalizadas }, 'Central de conversas: rotina de atendimento executada');
    }
  });

  cron.schedule('30 3 * * *', async () => {
    const r = await inboxCron.limparAntigas();
    if (r.mensagens > 0 || r.conversas > 0) {
      logger.info(r, 'Central de conversas: mensagens antigas apagadas');
    }
  });

  logger.info('Cron de lembretes iniciado');
};
