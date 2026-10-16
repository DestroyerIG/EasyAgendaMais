/**
 * messagesUpsertHandler.ts — Handler principal para eventos messages-upsert.
 *
 * A verificação isSelfMessage existe SOMENTE aqui (Passo 6).
 * Nenhum outro módulo deve duplicar essa verificação.
 */

import logger from '../../../utils/logger.js';
import { parseEvolutionWebhook } from '../utils/payloadParser.js';
import { resolveAuthorPhone, isSelfMessage, canonicalizePhone, extractPhoneFromJid } from '../utils/phoneUtils.js';
import { resolveTenant } from '../tenant/tenantResolver.js';
import { deduplicator } from '../utils/deduplication.js';
import * as botOrchestrator from '../../../bot/botOrchestrator.js';
import { getSession, isSessionExpired } from '../whatsappSessionService.js';
import { sendWhatsAppMessage } from '../whatsappMessageService.js';
import { inboxRecorder } from '../../../modules/whatsappInbox/inbox.recorder.js';
import { detectarPalavraChave } from '../../../modules/whatsappInbox/inbox.rules.js';

export const TEXTO_OPT_OUT = (negocio: string) =>
  `Pronto, você não vai mais receber mensagens automáticas do ${negocio}. Para voltar a receber, responda VOLTAR.`;
export const TEXTO_OPT_IN = (negocio: string) =>
  `Tudo certo! Você voltou a receber os lembretes e avisos do ${negocio}.`;

const ACTIVE_STATUSES = new Set(['active', 'trialing']);

const last4 = (s: string | null | undefined): string | null =>
  s ? String(s).slice(-4) : null;

export interface MessagesUpsertResult {
  ok: boolean;
  reason: string | null;
  authorPhone?: string;
  text?: string;
  messageId?: string | null;
  businessId?: string;
}

export const handleMessagesUpsert = async (
  rawPayload: unknown,
  { instanceName }: { instanceName?: string | null } = {},
): Promise<MessagesUpsertResult> => {
  const t0 = Date.now();

  // ── Passo 1: Parse ──────────────────────────────────────────────────────────
  const parsed = parseEvolutionWebhook(rawPayload);
  if (!parsed) {
    logger.info({ instanceName }, 'msg_handler: parse_failed');
    return { ok: false, reason: 'parse_failed' };
  }

  // ── Passo 2: fromMe check ───────────────────────────────────────────────────
  if (parsed.fromMe === true) {
    logger.info(
      {
        instanceName,
        messageId: parsed.messageId,
        remoteJid: parsed.remoteJid,
        sender: parsed.sender,
        destination: parsed.destination,
        messageType: parsed.messageType,
        textPreview: parsed.text?.slice(0, 30) ?? null,
      },
      'msg_handler: from_me',
    );
    // Eco do celular: a dona respondeu direto no WhatsApp. Grava na central, sem acionar o robô.
    const destino = parsed.remoteJid && !parsed.remoteJid.endsWith('@g.us')
      ? extractPhoneFromJid(parsed.remoteJid)
      : null;
    const tenantEco = destino ? await resolveTenant(instanceName ?? parsed.instanceName) : null;
    if (tenantEco && destino) {
      await inboxRecorder.registrarEco({
        businessId: tenantEco.business.id,
        phone: destino,
        texto: parsed.text,
        messageType: parsed.messageType,
        providerMessageId: parsed.messageId,
      });
    }
    return { ok: false, reason: 'from_me' };
  }

  // ── Passo 3: Resolver autor ─────────────────────────────────────────────────
  // Pass full rawPayload so resolveAuthorPhone can read top-level `sender`
  // (Evolution API places sender at root, not inside data).
  const resolved = resolveAuthorPhone(rawPayload);
  if (resolved.skip) {
    logger.info({ instanceName, source: resolved.source }, 'msg_handler: author_skip');
    return { ok: false, reason: resolved.source };
  }

  // ── Passo 4: Resolver tenant ────────────────────────────────────────────────
  const effectiveInstance = instanceName ?? parsed.instanceName;
  const tenant = await resolveTenant(effectiveInstance);
  if (!tenant) {
    logger.info({ instanceName: effectiveInstance }, 'msg_handler: tenant_not_found');
    return { ok: false, reason: 'tenant_not_found' };
  }

  // ── Passo 5: Verificar assinatura ───────────────────────────────────────────
  if (!ACTIVE_STATUSES.has(tenant.subscriptionStatus ?? '')) {
    logger.info(
      { instanceName: effectiveInstance, subscriptionStatus: tenant.subscriptionStatus },
      'msg_handler: subscription_inactive',
    );
    return { ok: false, reason: 'subscription_inactive' };
  }

  // ── Passo 6: Self-message check (ÚNICO no sistema) ──────────────────────────
  if (isSelfMessage(resolved.phone as string, tenant.connectedNumber ?? '')) {
    logger.info(
      {
        instanceName: effectiveInstance,
        authorCanonical: canonicalizePhone(resolved.phone as string),
        connectedLast4: last4(tenant.connectedNumber),
      },
      'msg_handler: self_message',
    );
    return { ok: false, reason: 'self_message' };
  }

  // ── Passo 7: Deduplicação ───────────────────────────────────────────────────
  if (parsed.messageId && deduplicator.isDuplicate(parsed.messageId)) {
    logger.info({ instanceName: effectiveInstance, messageId: parsed.messageId }, 'msg_handler: duplicate');
    return { ok: false, reason: 'duplicate' };
  }
  if (parsed.messageId) deduplicator.markSeen(parsed.messageId);

  // ── Passo 7b: Gravar entrada, SAIR/VOLTAR e atendimento humano ──────────────
  const phone = resolved.phone as string;
  const businessId = tenant.business.id;
  const sessao = await getSession(phone, businessId).catch(() => null);
  const conversa = await inboxRecorder.registrarEntrada({
    businessId,
    phone,
    texto: parsed.text,
    messageType: parsed.messageType,
    providerMessageId: parsed.messageId,
    sessaoRoboAtiva: Boolean(sessao && !isSessionExpired(sessao)),
  });

  const palavra = detectarPalavraChave(parsed.text);
  if (palavra) {
    const resposta = palavra === 'sair' ? TEXTO_OPT_OUT(tenant.business.name) : TEXTO_OPT_IN(tenant.business.name);
    if (palavra === 'sair') await inboxRecorder.registrarOptOut({ businessId, phone, keyword: 'sair' });
    else await inboxRecorder.registrarOptIn({ businessId, phone });
    await sendWhatsAppMessage(phone, resposta, { businessId, instanceName: effectiveInstance, origin: 'sistema' });
    return { ok: true, reason: palavra === 'sair' ? 'opt_out' : 'opt_in', authorPhone: phone, businessId };
  }

  if (conversa?.handler === 'humano') {
    logger.info({ instanceName: effectiveInstance, businessId }, 'msg_handler: human_handler');
    return { ok: true, reason: 'human_handler', authorPhone: phone, businessId };
  }

  // ── Passo 8: Verificar texto ────────────────────────────────────────────────
  if (!parsed.text?.trim()) {
    logger.info({ instanceName: effectiveInstance, authorPhone: resolved.phone }, 'msg_handler: no_text');
    return { ok: false, reason: 'no_text' };
  }

  // ── Passo 9: Executar bot ───────────────────────────────────────────────────
  logger.info(
    {
      instanceName: effectiveInstance,
      authorPhone: resolved.phone,
      businessId: tenant.business.id,
      textPreview: parsed.text.slice(0, 50),
    },
    'msg_handler: processing',
  );

  await botOrchestrator.process({
    businessId: tenant.business.id,
    authorPhone: resolved.phone as string,
    text: parsed.text,
    messageId: parsed.messageId,
    instanceName: effectiveInstance,
    rawPayload,
    connectedNumber: tenant.connectedNumber,
  });

  // ── Passo 10: Retornar ──────────────────────────────────────────────────────
  logger.info(
    { instanceName: effectiveInstance, ok: true, durationMs: Date.now() - t0 },
    'msg_handler: done',
  );

  return {
    ok: true,
    reason: null,
    authorPhone: resolved.phone as string,
    text: parsed.text,
    messageId: parsed.messageId ?? null,
    businessId: tenant.business.id,
  };
};
