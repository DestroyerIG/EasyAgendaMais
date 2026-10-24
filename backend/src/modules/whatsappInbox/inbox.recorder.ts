import logger from '../../utils/logger.js';
import { canonicalizePhone } from '../../services/whatsapp/utils/phoneUtils.js';
import { inboxRepository as repo } from './inbox.repository.js';
import { avancaStatus, marcadorMidia, previa } from './inbox.rules.js';
import type { Atendimento, Origem, StatusConversa, StatusMensagem } from './inbox.types.js';

export interface SaidaInput {
  businessId: string; phone: string; body: string; origem: Origem;
  providerMessageId: string | null; status: 'enviada' | 'falhou'; sentByUserId?: string | null;
}
export interface EntradaInput {
  businessId: string; phone: string; texto: string | null; messageType: string | null;
  providerMessageId: string | null; sessaoRoboAtiva: boolean;
}
export interface ConversaGravada { id: string; handler: Atendimento; status: StatusConversa; clientId: string | null }

interface ConversaRow { id: string; handler: string; status: string; clientId: string | null }

const digitosDe = (phone: string) => phone.replace(/\D/g, '');

function montarCorpo(texto: string | null, messageType: string | null) {
  const midia = marcadorMidia(messageType);
  const body = midia ? [midia.marcador, texto?.trim()].filter(Boolean).join(' ') : (texto?.trim() ?? '');
  return { midia, body };
}

const gravada = (c: ConversaRow, status?: string): ConversaGravada => ({
  id: c.id, handler: c.handler as Atendimento, status: (status ?? c.status) as StatusConversa, clientId: c.clientId,
});

export const inboxRecorder = {
  async registrarSaida(i: SaidaInput): Promise<void> {
    try {
      const chave = canonicalizePhone(i.phone);
      if (!chave) return;
      let conversa: ConversaRow | null = await repo.conversaPorChave(i.businessId, chave);
      if (!conversa) {
        const cliente = await repo.clientePorTelefone(i.businessId, i.phone);
        if (cliente || i.origem === 'bot') {
          conversa = await repo.criarConversa({ businessId: i.businessId, phone: digitosDe(i.phone), phoneKey: chave, clientId: cliente?.id ?? null });
        }
      }
      const inserida = await repo.inserirMensagem({
        businessId: i.businessId, conversationId: conversa?.id ?? null, phoneKey: chave, direction: 'out', origin: i.origem,
        body: conversa ? i.body : '', mediaType: null, providerMessageId: i.providerMessageId, status: i.status,
        sentByUserId: i.sentByUserId ?? null,
      });
      if (!inserida && i.providerMessageId) {
        // Corrida: o eco (fromMe) do webhook pode chegar antes desta gravação e ter sido gravado como manual_celular.
        const existente = await repo.mensagemPorProvider(i.businessId, i.providerMessageId);
        if (existente?.origin === 'manual_celular') {
          await repo.corrigirSaidaDoEco(existente.id, {
            origin: i.origem, sentByUserId: i.sentByUserId ?? null, body: conversa ? i.body : '',
            status: existente.status === 'enviada' ? i.status : existente.status,
          });
        }
      }
      if (conversa) {
        await repo.atualizarConversa(conversa.id, { lastMessageAt: new Date(), lastMessagePreview: previa(i.body) });
      }
    } catch (err) {
      logger.warn({ err, businessId: i.businessId }, 'inbox: registrarSaida falhou');
    }
  },

  async registrarEntrada(i: EntradaInput): Promise<ConversaGravada | null> {
    try {
      const chave = canonicalizePhone(i.phone);
      if (!chave) return null;
      const { midia, body } = montarCorpo(i.texto, i.messageType);
      if (!body) return null;
      let conversa: ConversaRow | null = await repo.conversaPorChave(i.businessId, chave);
      let clienteId: string | null = conversa?.clientId ?? null;
      let clienteNovo: string | null = null;
      if (!conversa) {
        const cliente = await repo.clientePorTelefone(i.businessId, i.phone);
        if (!cliente && !i.sessaoRoboAtiva) return null;
        conversa = await repo.criarConversa({ businessId: i.businessId, phone: digitosDe(i.phone), phoneKey: chave, clientId: cliente?.id ?? null });
        clienteId = conversa.clientId;
      } else if (!conversa.clientId) {
        const cliente = await repo.clientePorTelefone(i.businessId, i.phone);
        if (cliente) { clienteNovo = cliente.id; clienteId = cliente.id; }
      }
      const inserida = await repo.inserirMensagem({
        businessId: i.businessId, conversationId: conversa.id, phoneKey: chave, direction: 'in', origin: 'cliente',
        body, mediaType: midia?.mediaType ?? null, providerMessageId: i.providerMessageId, status: 'recebida', sentByUserId: null,
      });
      if (!inserida) return gravada({ ...conversa, clientId: clienteId });
      const agora = new Date();
      const status = conversa.handler === 'humano' ? 'aguardando' : 'aberta';
      await repo.atualizarConversa(conversa.id, {
        lastMessageAt: agora, lastInboundAt: agora, lastMessagePreview: previa(body),
        unreadCount: { increment: 1 }, status,
        ...(clienteNovo ? { clientId: clienteNovo } : {}),
      });
      return gravada({ ...conversa, clientId: clienteId }, status);
    } catch (err) {
      logger.warn({ err, businessId: i.businessId }, 'inbox: registrarEntrada falhou');
      return null;
    }
  },

  async registrarEco(i: { businessId: string; phone: string; texto: string | null; messageType: string | null; providerMessageId: string | null }): Promise<void> {
    try {
      const chave = canonicalizePhone(i.phone);
      if (!chave) return;
      if (i.providerMessageId && (await repo.mensagemPorProvider(i.businessId, i.providerMessageId))) return;
      let conversa: ConversaRow | null = await repo.conversaPorChave(i.businessId, chave);
      if (!conversa) {
        const cliente = await repo.clientePorTelefone(i.businessId, i.phone);
        if (!cliente) return;
        conversa = await repo.criarConversa({ businessId: i.businessId, phone: digitosDe(i.phone), phoneKey: chave, clientId: cliente.id });
      }
      const { midia, body } = montarCorpo(i.texto, i.messageType);
      if (!body) return;
      const inserida = await repo.inserirMensagem({
        businessId: i.businessId, conversationId: conversa.id, phoneKey: chave, direction: 'out', origin: 'manual_celular',
        body, mediaType: midia?.mediaType ?? null, providerMessageId: i.providerMessageId, status: 'enviada', sentByUserId: null,
      });
      if (!inserida) return;
      await repo.atualizarConversa(conversa.id, { lastMessageAt: new Date(), lastMessagePreview: previa(body) });
    } catch (err) {
      logger.warn({ err, businessId: i.businessId }, 'inbox: registrarEco falhou');
    }
  },

  async atualizarEntrega(i: { businessId: string; providerMessageId: string; status: 'entregue' | 'lida' }): Promise<void> {
    try {
      const atual = await repo.mensagemPorProvider(i.businessId, i.providerMessageId);
      if (atual && avancaStatus(atual.status as StatusMensagem, i.status)) {
        await repo.atualizarStatusMensagem(atual.id, i.status);
      }
    } catch (err) {
      logger.warn({ err, businessId: i.businessId }, 'inbox: atualizarEntrega falhou');
    }
  },

  async estaEmOptOut(businessId: string, phone: string): Promise<boolean> {
    try {
      const chave = canonicalizePhone(phone);
      if (!chave) return false;
      return !!(await repo.optOutAtivo(businessId, chave));
    } catch (err) {
      logger.warn({ err, businessId }, 'inbox: estaEmOptOut falhou');
      return false;
    }
  },

  /** Igual a `estaEmOptOut`, mas lança se a consulta falhar: usada na hora do envio da fila. */
  async estaEmOptOutOuFalha(businessId: string, phone: string): Promise<boolean> {
    const chave = canonicalizePhone(phone);
    if (!chave) return false;
    try {
      return !!(await repo.optOutAtivo(businessId, chave));
    } catch (err) {
      logger.warn({ err, businessId }, 'inbox: estaEmOptOutOuFalha falhou');
      throw err;
    }
  },

  /** Chaves de telefone em opt-out. Em erro, loga e lança: não se manda campanha sem saber quem saiu. */
  async telefonesEmOptOut(businessId: string): Promise<Set<string>> {
    try {
      return new Set((await repo.optOutsAtivos(businessId)).map((o) => o.phoneKey));
    } catch (err) {
      logger.error({ err, businessId }, 'inbox: telefonesEmOptOut falhou');
      throw err;
    }
  },

  async registrarOptOut(i: { businessId: string; phone: string; keyword: string }): Promise<void> {
    try {
      const chave = canonicalizePhone(i.phone);
      if (!chave) return;
      const cliente = await repo.clientePorTelefone(i.businessId, i.phone);
      await repo.gravarOptOut({ businessId: i.businessId, phoneKey: chave, clientId: cliente?.id ?? null, keyword: i.keyword });
      if (cliente) await repo.registrarConsentimento({ businessId: i.businessId, clientId: cliente.id, granted: false });
    } catch (err) {
      logger.warn({ err, businessId: i.businessId }, 'inbox: registrarOptOut falhou');
    }
  },

  async registrarOptIn(i: { businessId: string; phone: string }): Promise<void> {
    try {
      const chave = canonicalizePhone(i.phone);
      if (!chave) return;
      const cliente = await repo.clientePorTelefone(i.businessId, i.phone);
      await repo.reativarOptOut(i.businessId, chave);
      if (cliente) await repo.registrarConsentimento({ businessId: i.businessId, clientId: cliente.id, granted: true });
    } catch (err) {
      logger.warn({ err, businessId: i.businessId }, 'inbox: registrarOptIn falhou');
    }
  },

  async pedirAtendimentoHumano(businessId: string, phone: string): Promise<void> {
    try {
      const chave = canonicalizePhone(phone);
      if (!chave) return;
      let conversa: ConversaRow | null = await repo.conversaPorChave(businessId, chave);
      if (!conversa) {
        const cliente = await repo.clientePorTelefone(businessId, phone);
        conversa = await repo.criarConversa({ businessId, phone: digitosDe(phone), phoneKey: chave, clientId: cliente?.id ?? null });
      }
      await repo.atualizarConversa(conversa.id, { handler: 'humano', status: 'aguardando', assignedUserId: null });
    } catch (err) {
      logger.warn({ err, businessId }, 'inbox: pedirAtendimentoHumano falhou');
    }
  },

  /** Nota do sistema na conversa (não é envio ao cliente). */
  async avisoDoSistema(businessId: string, phone: string, texto: string): Promise<void> {
    try {
      const chave = canonicalizePhone(phone);
      if (!chave) return;
      let conversa: ConversaRow | null = await repo.conversaPorChave(businessId, chave);
      if (!conversa) {
        const cliente = await repo.clientePorTelefone(businessId, phone);
        conversa = await repo.criarConversa({ businessId, phone: digitosDe(phone), phoneKey: chave, clientId: cliente?.id ?? null });
      }
      await repo.inserirMensagem({
        businessId, conversationId: conversa.id, phoneKey: chave, direction: 'out', origin: 'painel_evento',
        body: texto, mediaType: null, providerMessageId: null, status: 'enviada', sentByUserId: null,
      });
      await repo.atualizarConversa(conversa.id, { lastMessageAt: new Date(), lastMessagePreview: previa(texto) });
    } catch (err) {
      logger.warn({ err, businessId }, 'inbox: avisoDoSistema falhou');
    }
  },
};
