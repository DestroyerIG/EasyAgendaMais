import logger from '../../../utils/logger.js';
import { resolveTenant } from '../tenant/tenantResolver.js';
import { inboxRecorder } from '../../../modules/whatsappInbox/inbox.recorder.js';
import { statusDeEntrega } from '../../../modules/whatsappInbox/inbox.rules.js';

type Item = {
  keyId?: unknown; messageId?: unknown; status?: unknown;
  key?: { id?: unknown }; update?: { status?: unknown };
};

/** MESSAGES_UPDATE da Evolution: atualiza entregue/lida das mensagens gravadas. Nunca lança. */
export const handleMessagesUpdate = async (
  raw: unknown,
  ctx: { instanceName?: string | null },
): Promise<{ atualizadas: number }> => {
  try {
    const body = (raw ?? {}) as { instance?: unknown; data?: unknown };
    const instancia = ctx.instanceName ?? (typeof body.instance === 'string' ? body.instance : null);
    const tenant = instancia ? await resolveTenant(instancia) : null;
    if (!tenant) return { atualizadas: 0 };

    const itens = (Array.isArray(body.data) ? body.data : [body.data]) as Array<Item | null | undefined>;
    let atualizadas = 0;
    for (const item of itens) {
      if (!item) continue;
      const id = item.keyId ?? item.key?.id ?? item.messageId;
      const novo = statusDeEntrega(item.status ?? item.update?.status);
      if (typeof id !== 'string' || !id || !novo) continue;
      await inboxRecorder.atualizarEntrega({ businessId: tenant.business.id, providerMessageId: id, status: novo });
      atualizadas++;
    }
    logger.debug({ instancia, atualizadas }, 'messagesUpdateHandler: processado');
    return { atualizadas };
  } catch (err) {
    logger.warn({ err }, 'messagesUpdateHandler: falhou');
    return { atualizadas: 0 };
  }
};
