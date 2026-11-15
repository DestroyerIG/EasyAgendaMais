/**
 * webhookSecret.ts — segredo compartilhado entre a Evolution API e o backend.
 *
 * Sem este segredo o webhook aceita qualquer chamador, e o tenant seria escolhido pelo
 * `instance` do corpo da requisição. Quando WHATSAPP_WEBHOOK_SECRET está definido:
 *   - o backend registra o webhook na Evolution com o header `x-webhook-secret`;
 *   - as rotas de webhook recusam (401) chamadas sem o header correto.
 */

import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import logger from '../../utils/logger.js';

export const WEBHOOK_SECRET_HEADER = 'x-webhook-secret';

export const getWebhookSecret = (): string | null => {
  const value = String(process.env.WHATSAPP_WEBHOOK_SECRET || '').trim();
  return value || null;
};

/** Headers que o backend pede à Evolution para enviar em cada webhook (ou undefined sem segredo). */
export const webhookSecretHeaders = (): Record<string, string> | undefined => {
  const secret = getWebhookSecret();
  return secret ? { [WEBHOOK_SECRET_HEADER]: secret } : undefined;
};

const iguais = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
};

let avisouSemSegredo = false;

export const webhookSecretGuard = (req: Request, res: Response, next: NextFunction): void => {
  const secret = getWebhookSecret();

  if (!secret) {
    if (process.env.NODE_ENV === 'production' && !avisouSemSegredo) {
      avisouSemSegredo = true;
      logger.warn(
        'WHATSAPP_WEBHOOK_SECRET não configurado: o webhook do WhatsApp aceita qualquer chamador. Defina o segredo e reinicie para registrar o header na Evolution.'
      );
    }
    next();
    return;
  }

  const provided = req.headers[WEBHOOK_SECRET_HEADER];
  if (typeof provided !== 'string' || !iguais(provided.trim(), secret)) {
    logger.warn({ requestId: req.requestId, path: req.path }, 'webhook WhatsApp recusado: segredo ausente ou inválido');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
};
