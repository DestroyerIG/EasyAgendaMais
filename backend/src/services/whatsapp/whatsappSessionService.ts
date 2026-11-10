/**
 * whatsappSessionService.ts — Gerenciamento de sessões do bot WhatsApp.
 * Cada sessão representa uma conversa ativa entre o bot e um número de phone.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { SESSION_TIMEOUT_MS, STEPS } from './whatsappConstants.js';

export interface WhatsAppSession {
  id: string;
  phone: string;
  businessId: string;
  step: string;
  data: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Busca sessão ativa para o phone/business.
 * Retorna null se não encontrada.
 */
export const getSession = async (phone: string, businessId: string): Promise<WhatsAppSession | null> => {
  const session = await prisma.whatsappSession.findFirst({
    where: { phone, businessId },
    orderBy: { updatedAt: 'desc' },
  });
  if (!session) return null;
  return {
    id: session.id,
    phone: session.phone,
    businessId: session.businessId,
    step: session.step,
    data: (session.data as Record<string, unknown>) ?? null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
};

/**
 * Verifica se a sessão expirou (30 min de inatividade por padrão). A espera do sinal vale até o
 * prazo da pré-reserva (pode passar de 30 min), mesmo sem mensagem nesse meio-tempo.
 */
export const isSessionExpired = (session: WhatsAppSession | null): boolean => {
  if (!session) return true;
  if (session.step === STEPS.AWAITING_DEPOSIT) {
    const prazo = new Date(String(session.data?.expiresAt ?? '')).getTime();
    if (prazo > Date.now()) return false;
  }
  return (Date.now() - new Date(session.updatedAt).getTime()) > SESSION_TIMEOUT_MS;
};

/**
 * Cria sessão nova no step 'menu' com data vazia.
 */
export const createSession = async (phone: string, businessId: string): Promise<void> => {
  await prisma.whatsappSession.create({
    data: {
      phone,
      businessId,
      step: STEPS.MENU,
      data: Prisma.JsonNull,
    },
  });
};

/**
 * Atualiza step e data da sessão.
 */
export const updateSession = async (
  phone: string,
  businessId: string,
  step: string,
  data: Record<string, unknown>,
): Promise<void> => {
  await prisma.whatsappSession.updateMany({
    where: { phone, businessId },
    data: {
      step,
      data: data as Prisma.InputJsonValue,
    },
  });
};

/**
 * Remove sessões do phone/business.
 */
export const deleteSession = async (phone: string, businessId: string): Promise<void> => {
  await prisma.whatsappSession.deleteMany({
    where: { phone, businessId },
  });
};

/**
 * Remove só a sessão que está esperando o sinal DESTA reserva. Uma conversa nova da cliente (outro
 * passo ou outra reserva) nunca é apagada pelo aviso de expiração ou de pagamento de uma reserva antiga.
 */
export const deleteSessaoDoSinal = async (phone: string, businessId: string, appointmentId: string): Promise<void> => {
  await prisma.whatsappSession.deleteMany({
    where: {
      phone,
      businessId,
      step: STEPS.AWAITING_DEPOSIT,
      data: { path: ['appointmentId'], equals: appointmentId },
    },
  });
};
