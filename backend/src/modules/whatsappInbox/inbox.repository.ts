import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { canonicalizePhone } from '../../services/whatsapp/utils/phoneUtils.js';
import type { AgendamentoRelacionadoDto, FiltroConversa } from './inbox.types.js';

const ONDE: Record<FiltroConversa, Prisma.WhatsappConversationWhereInput> = {
  todas: { status: { not: 'finalizada' } },
  aguardando: { status: 'aguardando' },
  bot: { handler: 'bot', status: { not: 'finalizada' } },
  finalizadas: { status: 'finalizada' },
};
// O usuário não tem nome próprio: a dona usa o nome do negócio (ownerName); funcionária, o começo do e-mail.
const USUARIO = { select: { id: true, email: true, role: true, business: { select: { ownerName: true } } } } as const;
export const nomeDeUsuario = (u: { email: string; role: string; business: { ownerName: string } }): string => {
  if (u.role === 'tenant_admin' && u.business.ownerName.trim()) return u.business.ownerName.trim();
  const base = (u.email.split('@')[0] ?? '').replace(/[._-]+/g, ' ').trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : 'Alguém';
};
const INCLUIR = {
  client: { select: { id: true, name: true } },
  assignedUser: USUARIO,
} as const;

export const inboxRepository = {
  dadosRespostas: async (businessId: string) => {
    const [b, cfg] = await Promise.all([
      prisma.business.findUnique({ where: { id: businessId }, select: { name: true, pixKey: true, pixKeyType: true, address: true } }),
      prisma.whatsappBotConfig.findUnique({ where: { businessId }, select: { politicaMessage: true } }),
    ]);
    return { negocio: b?.name ?? '', pixKey: b?.pixKey ?? null, pixKeyType: b?.pixKeyType ?? null, endereco: b?.address ?? null, politica: cfg?.politicaMessage ?? null };
  },
  enviosDesde: async (businessId: string, desde: Date) => (await prisma.whatsappMessage.groupBy({
    by: ['origin', 'status'], where: { businessId, direction: 'out', origin: { not: 'painel_evento' }, createdAt: { gte: desde } },
    _count: { _all: true } })).map((g) => ({ origin: g.origin, status: g.status, n: g._count._all })),
  historicoEnvios: (businessId: string, take = 20, origens?: string[]) => prisma.whatsappMessage.findMany({
    where: { businessId, direction: 'out', origin: origens ? { in: origens } : { not: 'painel_evento' } }, orderBy: { createdAt: 'desc' }, take,
    select: { id: true, createdAt: true, origin: true, status: true, phoneKey: true,
      conversation: { select: { phone: true, client: { select: { name: true } } } } } }),
  dadosConexao: (businessId: string) => prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { whatsapp: true, whatsappConnectedAt: true } }),
  /** Cliente do negócio com o mesmo telefone canônico (pré-filtro pelos 8 últimos dígitos, igualdade em JS). */
  async clientePorTelefone(businessId: string, phone: string): Promise<{ id: string; name: string } | null> {
    const chave = canonicalizePhone(phone);
    if (!chave) return null;
    const fim = chave.slice(-8);
    // '[^0-9]' e não '\D': o $queryRaw usa o texto cru do template, então '\\D' chegaria ao
    // Postgres com as duas barras e não removeria nada (conferido no banco).
    const candidatos = await prisma.$queryRaw<Array<{ id: string; name: string; phone: string }>>`
      SELECT id, name, phone FROM clients
       WHERE business_id = ${businessId}::uuid AND right(regexp_replace(phone, '[^0-9]', '', 'g'), 8) = ${fim}`;
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
    prisma.whatsappConversation.update({ where: { id }, data, include: INCLUIR }),
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
    prisma.whatsappMessage.findFirst({ where: { businessId, providerMessageId }, select: { id: true, status: true, origin: true } }),
  /** Eco do celular que chegou antes da saída real: passa a refletir origem, autor, texto e status da saída. */
  corrigirSaidaDoEco: (id: string, data: { origin: string; sentByUserId: string | null; body: string; status: string }) =>
    prisma.whatsappMessage.update({ where: { id }, data }),
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
  conversasHumanasParadas: (antesDe: Date) => prisma.whatsappConversation.findMany({
    where: { handler: 'humano', lastMessageAt: { lt: antesDe } }, select: { id: true, businessId: true, phoneKey: true }, take: 500 }),
  finalizarConversasDoRobo: async (antesDe: Date) => (await prisma.whatsappConversation.updateMany({
    where: { handler: 'bot', status: { not: 'finalizada' }, lastMessageAt: { lt: antesDe } }, data: { status: 'finalizada' } })).count,
  apagarMensagensAntigas: async (antesDe: Date) => (await prisma.whatsappMessage.deleteMany({ where: { createdAt: { lt: antesDe } } })).count,
  apagarConversasVazias: async (antesDe: Date) => (await prisma.whatsappConversation.deleteMany({
    where: { lastMessageAt: { lt: antesDe }, messages: { none: {} } } })).count,
  listarConversas: (businessId: string, filtro: FiltroConversa, cursor: Date | undefined, take: number) =>
    prisma.whatsappConversation.findMany({
      where: { businessId, ...ONDE[filtro], ...(cursor ? { lastMessageAt: { lt: cursor } } : {}) },
      orderBy: { lastMessageAt: 'desc' }, take, include: INCLUIR,
    }),
  async contarConversas(businessId: string): Promise<Record<FiltroConversa, number>> {
    const [todas, aguardando, bot, finalizadas] = await Promise.all(
      (['todas', 'aguardando', 'bot', 'finalizadas'] as const).map((f) => prisma.whatsappConversation.count({ where: { businessId, ...ONDE[f] } })));
    return { todas: todas!, aguardando: aguardando!, bot: bot!, finalizadas: finalizadas! };
  },
  conversaDoNegocio: (businessId: string, id: string) => prisma.whatsappConversation.findFirst({ where: { id, businessId }, include: INCLUIR }),
  listarMensagens: (conversationId: string, antes: Date | undefined, take = 51) => prisma.whatsappMessage.findMany({
    where: { conversationId, ...(antes ? { createdAt: { lt: antes } } : {}) }, orderBy: { createdAt: 'desc' }, take,
    include: { sentByUser: USUARIO } }),
  async nomeUsuario(userId: string): Promise<string> {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, role: true, business: { select: { ownerName: true } } } });
    return u ? nomeDeUsuario(u) : 'Alguém';
  },
  zerarNaoLidas: async (businessId: string, ids?: string[]) => (await prisma.whatsappConversation.updateMany({
    where: { businessId, unreadCount: { gt: 0 }, ...(ids ? { id: { in: ids } } : {}) }, data: { unreadCount: 0 } })).count,
  async clientesComSinalPendente(businessId: string, clientIds: string[]): Promise<Set<string>> {
    if (!clientIds.length) return new Set();
    const rows = await prisma.appointment.findMany({
      where: { businessId, clientId: { in: clientIds }, status: 'aguardando_pagamento', expiresAt: { gt: new Date() } },
      select: { clientId: true }, distinct: ['clientId'] });
    return new Set(rows.map((r) => r.clientId));
  },
  clienteBasico: (businessId: string, id: string) => prisma.client.findFirst({
    where: { id, businessId }, select: { id: true, name: true, phone: true, createdAt: true, birthDate: true } }),
  async proximoAgendamento(businessId: string, clientId: string, hoje: string): Promise<AgendamentoRelacionadoDto | null> {
    const agora = new Date();
    const rows = await prisma.appointment.findMany({
      where: { businessId, clientId, date: { gte: new Date(`${hoje}T00:00:00.000Z`) },
        status: { in: ['aguardando_pagamento', 'confirmado', 'em_atendimento'] } },
      orderBy: [{ date: 'asc' }, { time: 'asc' }], take: 5,
      select: { id: true, date: true, time: true, status: true, depositAmount: true, expiresAt: true,
        service: { select: { name: true, price: true } }, professional: { select: { name: true } } } });
    const a = rows.find((r) => r.status !== 'aguardando_pagamento' || (r.expiresAt && r.expiresAt > agora));
    return a ? { id: a.id, data: a.date.toISOString().slice(0, 10), hora: a.time.toISOString().slice(11, 16), status: a.status,
      servico: a.service.name, valor: Number(a.service.price), profissional: a.professional.name,
      sinal: a.depositAmount === null ? null : Number(a.depositAmount), expiraEm: a.expiresAt?.toISOString() ?? null } : null;
  },
  registrarConsentimento: (d: { businessId: string; clientId: string; granted: boolean }) =>
    prisma.clientConsent.create({ data: { businessId: d.businessId, clientId: d.clientId, granted: d.granted, channel: 'whatsapp' } }),
};
