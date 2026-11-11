/**
 * Envio de mensagens, formatação de templates e construção de menus.
 */

import { sendWhatsAppText } from '../whatsappClient.js';
import logger from '../../utils/logger.js';
import { inboxRecorder } from '../../modules/whatsappInbox/inbox.recorder.js';
import { ehAutomatica } from '../../modules/whatsappInbox/inbox.rules.js';
import type { Origem } from '../../modules/whatsappInbox/inbox.types.js';

export interface SendWhatsAppMessageContext {
  remoteJidOriginal?: string | null;
  eventName?: string | null;
  dedupeKey?: string | null;
  messageId?: string | null;
  captureCollector?: (message: string) => void;
  simulate?: boolean;
  instanceName?: string | null;
  businessId?: string | null;
  origin?: Origem;
  sentByUserId?: string | null;
  onProviderResult?: (r: { providerMessageId: string | null }) => void;
  [key: string]: unknown;
}

export interface FormatMessageData {
  businessName?: string;
  serviceName?: string;
  professionalName?: string;
  dateFormatted?: string;
  time?: string;
  servicePrice?: string;
  clientName?: string;
  instagramHandle?: string;
  /** Faixa de atendimento ("08:00 às 18:00"). */
  horarioAtendimento?: string;
  /** Hora em que o negócio fecha hoje. */
  horaFechamento?: string;
  /** Valor do sinal já formatado, ex.: 20,00. */
  depositAmount?: string;
  /** Prazo para pagar o sinal, em minutos. */
  prazoMin?: string;
  paymentLink?: string;
}

export interface MenuOption {
  label: string;
  emoji?: string;
}

const gravarSaida = async (
  phone: string,
  body: string,
  context: SendWhatsAppMessageContext,
  enviado: boolean,
  providerMessageId: string | null,
): Promise<void> => {
  if (!context.businessId || context.simulate === true) return;
  try {
    await inboxRecorder.registrarSaida({
      businessId: context.businessId,
      phone,
      body,
      origem: (context.origin ?? 'sistema') as Origem,
      providerMessageId,
      status: enviado ? 'enviada' : 'falhou',
      sentByUserId: context.sentByUserId ?? null,
    });
  } catch (err) {
    logger.warn({ err }, 'inbox: gravar saída falhou');
  }
};

/**
 * Envia mensagem via provider configurado (Evolution API).
 */
export const sendWhatsAppMessage = async (
  phone: string | number,
  message: string | number,
  context: SendWhatsAppMessageContext = {},
): Promise<boolean> => {
  const normalizedPhone = typeof phone === 'string' ? phone.trim() : String(phone || '').trim();
  const normalizedMessage = typeof message === 'string' ? message.trim() : String(message || '').trim();
  const logContext = {
    phone: normalizedPhone || null,
    remoteJidOriginal: context?.remoteJidOriginal || null,
    eventName: context?.eventName || null,
    dedupeKey: context?.dedupeKey || null,
    messageId: context?.messageId || null,
    messageLength: normalizedMessage.length,
  };

  if (!normalizedPhone) {
    logger.warn(logContext, 'Mensagem nao enviada: telefone ausente');
    return false;
  }

  if (!normalizedMessage) {
    logger.warn(logContext, 'Mensagem nao enviada: texto vazio');
    return false;
  }

  try {
    if (typeof context?.captureCollector === 'function') {
      context.captureCollector(normalizedMessage);
    }

    if (context?.simulate === true) {
      logger.info(logContext, 'ENVIO DISPARADO (SIMULADOR)');
      return true;
    }

    const origem = (context.origin ?? 'sistema') as Origem;
    if (context.businessId && ehAutomatica(origem) && await inboxRecorder.estaEmOptOut(context.businessId, normalizedPhone)) {
      logger.info(logContext, 'Mensagem automática não enviada: número em opt-out (SAIR)');
      return false;
    }

    logger.info(logContext, 'ENVIO DISPARADO');
    logger.debug(logContext, 'Solicitacao de envio WhatsApp ao provider');

    let providerMessageId: string | null = null;
    const sent = await sendWhatsAppText(normalizedPhone, normalizedMessage, {
      ...context,
      onProviderResult: (r) => { providerMessageId = r.providerMessageId; context.onProviderResult?.(r); },
    });
    await gravarSaida(normalizedPhone, normalizedMessage, context, Boolean(sent), providerMessageId);

    if (!sent) {
      logger.warn(logContext, 'Mensagem nao enviada pelo provider WhatsApp');
      return false;
    }

    logger.info(logContext, 'Mensagem enviada via provider WhatsApp');
    return true;
  } catch (error) {
    logger.error({ err: error, ...logContext }, 'Erro ao enviar mensagem WhatsApp');
    await gravarSaida(normalizedPhone, normalizedMessage, context, false, null);
    return false;
  }
};

/**
 * Substitui placeholders nas mensagens.
 */
export const formatMessage = (template: string, data: FormatMessageData = {}): string => {
  if (!template) return '';

  let message = template;
  const placeholders: Record<string, string> = {
    '{nome_negocio}': data.businessName || '',
    '{servico}': data.serviceName || '',
    '{profissional}': data.professionalName || '',
    '{data}': data.dateFormatted || '',
    '{horario}': data.time || '',
    '{valor}': data.servicePrice || '',
    '{nome_cliente}': data.clientName || '',
    '{instagram_handle}': data.instagramHandle || '',
    '{horario_atendimento}': data.horarioAtendimento || '',
    '{hora_fechamento}': data.horaFechamento || '',
    '{valor_sinal}': data.depositAmount || '',
    '{prazo}': data.prazoMin || '',
    '{link_pagamento}': data.paymentLink || '',
  };

  for (const [key, value] of Object.entries(placeholders)) {
    message = message.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value || '');
  }

  return message;
};

/**
 * Gera a welcome message a partir do header + opções do menu.
 */
export const buildWelcomeMessage = (
  welcomeHeader: string | null | undefined,
  menuOptions: MenuOption[],
  businessName: string,
  contexto?: string,
): string => {
  const header = formatMessage(welcomeHeader || 'Olá 👋 Que bom ter você aqui!', { businessName });

  const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

  let menuText = '';
  menuOptions.forEach((opt, index) => {
    const num = index < 10 ? numberEmojis[index] : `${index + 1}.`;
    const emoji = opt.emoji ? ` ${opt.emoji}` : '';
    menuText += `\n${num} *${opt.label}*${emoji}`;
  });

  const cabecalho = contexto ? `${header}\n\n${contexto}` : header;
  return cabecalho + '\n' + menuText;
};
