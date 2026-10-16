import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { canonicalizePhone } from '../../services/whatsapp/utils/phoneUtils.js';

export const inboxRepository = {
  /** Cliente do negócio com o mesmo telefone canônico (pré-filtro pelos 8 últimos dígitos, igualdade em JS). */
  async clientePorTelefone(businessId: string, phone: string): Promise<{ id: string; name: string } | null> {
    const chave = canonicalizePhone(phone);
    if (!chave) return null;
    const fim = chave.slice(-8);
    // '\\D' no fonte TS chega ao Postgres como '\D' (num template o '\D' viraria 'D').
    const candidatos = await prisma.$queryRaw<Array<{ id: string; name: string; phone: string }>>`
      SELECT id, name, phone FROM clients
       WHERE business_id = ${businessId}::uuid AND right(regexp_replace(phone, '\\D', '', 'g'), 8) = ${fim}`;
    return candidatos.find((c) => canonicalizePhone(c.phone) === chave) ?? null;
  },
  conversaPorChave: (businessId: string, phoneKey: string) =>
    prisma.whatsappConversation.findUnique({ where: { businessId_phoneKey: { businessId, phoneKey } } }),
  criarConversa: (d: { businessId: string; phone: string; phoneKey: string; clientId: string | null }) =>
    prisma.whatsappConversation.upsert({
      where: { businessId_phoneKey: { businessId: d.businessId, phoneKey: d.phoneKey } },
      create: d, update: {},
    }),
  atualizarConversa: (id: string, data: Prisma.WhatsappConversationUncheckedUpdateInput) =>
    prisma.whatsappConversation.update({ where: { id }, data }),
  /** Insere ignorando duplicata de provider_message_id; devolve false se já existia. */
  async inserirMensagem(d: {
    businessId: string; conversationId: string | null; phoneKey: string; direction: 'in' | 'out'; origin: string;
    body: string; mediaType: string | null; providerMessageId: string | null; status: string; sentByUserId: string | null;
  }): Promise<boolean> {
    if (d.providerMessageId) {
      const existe = await prisma.whatsappMessage.findFirst({ where: { businessId: d.businessId, providerMessageId: d.providerMessageId }, select: { id: true } });
      if (existe) return false;
    }
    try { await prisma.whatsappMessage.create({ data: d }); return true; }
    catch (e) { if ((e as { code?: string }).code === 'P2002') return false; throw e; }
  },
  mensagemPorProvider: (businessId: string, providerMessageId: string) =>
    prisma.whatsappMessage.findFirst({ where: { businessId, providerMessageId }, select: { id: true, status: true } }),
  atualizarStatusMensagem: (id: string, status: string) => prisma.whatsappMessage.update({ where: { id }, data: { status } }),
  optOutAtivo: (businessId: string, phoneKey: string) =>
    prisma.whatsappOptOut.findFirst({ where: { businessId, phoneKey, reactivatedAt: null }, select: { id: true } }),
  gravarOptOut: (d: { businessId: string; phoneKey: string; clientId: string | null; keyword: string }) =>
    prisma.whatsappOptOut.upsert({
      where: { businessId_phoneKey: { businessId: d.businessId, phoneKey: d.phoneKey } },
      create: d, update: { keyword: d.keyword, clientId: d.clientId, optedOutAt: new Date(), reactivatedAt: null },
    }),
  reativarOptOut: (businessId: string, phoneKey: string) =>
    prisma.whatsappOptOut.updateMany({ where: { businessId, phoneKey, reactivatedAt: null }, data: { reactivatedAt: new Date() } }),
  registrarConsentimento: (d: { businessId: string; clientId: string; granted: boolean }) =>
    prisma.clientConsent.create({ data: { businessId: d.businessId, clientId: d.clientId, granted: d.granted, channel: 'whatsapp' } }),
};
