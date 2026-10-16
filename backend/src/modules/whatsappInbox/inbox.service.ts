import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { todayInTimezone } from '../../utils/businessDate.js';
import { getBusinessScheduleSettings } from '../../services/scheduleSettingsService.js';
import { sendWhatsAppMessage } from '../../services/whatsapp/whatsappMessageService.js';
import { deleteSession } from '../../services/whatsapp/whatsappSessionService.js';
import { whatsappService } from '../whatsapp/whatsapp.service.js';
import { crmRepository } from '../crm/crm.repository.js';
import { resumirCliente } from '../crm/crmMetrics.js';
import { inboxRepository, nomeDeUsuario } from './inbox.repository.js';
import type {
  Atendimento, ConversaDetalheDto, ConversaResumoDto, ContextoClienteDto, FiltroConversa, ListaConversasDto,
  ListaMensagensDto, MensagemDto, Origem, StatusConversa, StatusMensagem,
} from './inbox.types.js';

type Ator = { userId: string; role: 'tenant_admin' | 'employee' };

const POR_PAGINA = 30;
const MENSAGENS_POR_PAGINA = 50;
const SEM_PERMISSAO = 'Esta conversa está com outra pessoa';

type ConversaComRelacoes = NonNullable<Awaited<ReturnType<typeof inboxRepository.conversaDoNegocio>>>;

const paraResumo = (c: ConversaComRelacoes, sinalPendente: boolean): ConversaResumoDto => ({
  id: c.id,
  telefone: c.phone,
  nome: c.client?.name ?? null,
  clientId: c.clientId,
  atendimento: c.handler as Atendimento,
  status: c.status as StatusConversa,
  responsavel: c.assignedUser ? { id: c.assignedUser.id, nome: nomeDeUsuario(c.assignedUser) } : null,
  ultimaMensagemEm: c.lastMessageAt.toISOString(),
  previa: c.lastMessagePreview,
  naoLidas: c.unreadCount,
  sinalPendente,
});

async function resumoDe(businessId: string, c: ConversaComRelacoes): Promise<ConversaResumoDto> {
  const pendentes = c.clientId ? await inboxRepository.clientesComSinalPendente(businessId, [c.clientId]) : new Set<string>();
  return paraResumo(c, !!c.clientId && pendentes.has(c.clientId));
}

async function carregar(businessId: string, id: string): Promise<ConversaComRelacoes> {
  const c = await inboxRepository.conversaDoNegocio(businessId, id);
  if (!c) throw new NotFoundError('Conversa');
  return c;
}

/** Funcionária só mexe na conversa que é dela, ou na que ninguém assumiu e está aguardando/com o robô. */
function exigirPodeAtender(c: ConversaComRelacoes, ator: Ator): void {
  if (ator.role !== 'employee') return;
  const livre = c.assignedUserId === null && (c.status === 'aguardando' || c.handler === 'bot');
  if (c.assignedUserId !== ator.userId && !livre) throw new ForbiddenError(SEM_PERMISSAO);
}

async function registrarEvento(businessId: string, c: ConversaComRelacoes, texto: string): Promise<void> {
  await inboxRepository.inserirMensagem({
    businessId, conversationId: c.id, phoneKey: c.phoneKey, direction: 'out', origin: 'painel_evento',
    body: texto, mediaType: null, providerMessageId: null, status: 'enviada', sentByUserId: null,
  });
}

async function assumirConversa(businessId: string, ator: Ator, c: ConversaComRelacoes): Promise<ConversaComRelacoes> {
  const jaEhDela = c.handler === 'humano' && c.assignedUserId === ator.userId;
  const atualizada = await inboxRepository.atualizarConversa(c.id, { handler: 'humano', assignedUserId: ator.userId, status: 'aberta' });
  if (!jaEhDela) {
    const nome = await inboxRepository.nomeUsuario(ator.userId);
    await registrarEvento(businessId, c, `${nome} assumiu o atendimento`);
  }
  return atualizada as ConversaComRelacoes;
}

async function contextoDoCliente(businessId: string, clientId: string): Promise<ContextoClienteDto | null> {
  const cliente = await inboxRepository.clienteBasico(businessId, clientId);
  if (!cliente) return null;
  const { timezone } = await getBusinessScheduleSettings(businessId);
  const hoje = todayInTimezone(timezone);
  const visitas = await crmRepository.visitasDoCliente(businessId, clientId);
  const aniversario = cliente.birthDate ? cliente.birthDate.toISOString().slice(0, 10) : null;
  const resumo = resumirCliente(visitas, hoje, aniversario);
  const agendamento = await inboxRepository.proximoAgendamento(businessId, clientId, hoje);
  const recentes = [...visitas].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2);
  return {
    cliente: { id: cliente.id, nome: cliente.name, telefone: cliente.phone, desde: cliente.createdAt.toISOString() },
    fase: resumo.fase,
    ltv: resumo.ltv,
    cicloMedio: resumo.cicloMedio,
    agendamento,
    ultimasVisitas: recentes.map((v) => ({ data: v.date, servico: v.servico, valor: v.receita })),
  };
}

const paraMensagem = (m: {
  id: string; direction: string; origin: string; body: string; mediaType: string | null; status: string;
  sentByUser: { email: string; role: string; business: { ownerName: string } } | null; createdAt: Date;
}): MensagemDto => ({
  id: m.id,
  direcao: m.direction as MensagemDto['direcao'],
  origem: m.origin as Origem,
  texto: m.body,
  tipoMidia: m.mediaType,
  status: m.status as StatusMensagem,
  autor: m.origin === 'manual_painel' ? (m.sentByUser ? nomeDeUsuario(m.sentByUser) : null) : null,
  criadaEm: m.createdAt.toISOString(),
});

export const inboxService = {
  async listar(businessId: string, q: { filtro: FiltroConversa; cursor?: string }): Promise<ListaConversasDto> {
    const [linhas, contadores] = await Promise.all([
      inboxRepository.listarConversas(businessId, q.filtro, q.cursor ? new Date(q.cursor) : undefined, POR_PAGINA + 1),
      inboxRepository.contarConversas(businessId),
    ]);
    const pagina = linhas.slice(0, POR_PAGINA);
    const clientIds = [...new Set(pagina.map((c) => c.clientId).filter((x): x is string => !!x))];
    const pendentes = await inboxRepository.clientesComSinalPendente(businessId, clientIds);
    const itens = pagina.map((c) => paraResumo(c as ConversaComRelacoes, !!c.clientId && pendentes.has(c.clientId)));
    const ultima = pagina[pagina.length - 1];
    return {
      itens,
      contadores,
      proximoCursor: linhas.length > POR_PAGINA && ultima ? ultima.lastMessageAt.toISOString() : null,
    };
  },

  async detalhe(businessId: string, id: string): Promise<ConversaDetalheDto> {
    let c = await carregar(businessId, id);
    if (!c.clientId) {
      const achada = await inboxRepository.clientePorTelefone(businessId, c.phone);
      if (achada) {
        c = (await inboxRepository.atualizarConversa(c.id, { clientId: achada.id })) as ConversaComRelacoes;
        if (!c.clientId) c = { ...c, clientId: achada.id, client: { id: achada.id, name: achada.name } };
      }
    }
    const contexto = c.clientId ? await contextoDoCliente(businessId, c.clientId) : null;
    return { conversa: await resumoDe(businessId, c), contexto };
  },

  async mensagens(businessId: string, id: string, antes?: string): Promise<ListaMensagensDto> {
    const c = await carregar(businessId, id);
    const linhas = await inboxRepository.listarMensagens(c.id, antes ? new Date(antes) : undefined, MENSAGENS_POR_PAGINA + 1);
    return {
      itens: linhas.slice(0, MENSAGENS_POR_PAGINA).map(paraMensagem).reverse(),
      temMais: linhas.length > MENSAGENS_POR_PAGINA,
    };
  },

  async enviar(businessId: string, ator: Ator, id: string, texto: string): Promise<{ enviado: true }> {
    const c = await carregar(businessId, id);
    exigirPodeAtender(c, ator);
    const { status } = await whatsappService.getStatus(businessId);
    if (status !== 'connected') throw new ConflictError('WhatsApp desconectado. Reconecte na aba Conexão.');
    if (c.handler === 'bot' || c.assignedUserId !== ator.userId) await assumirConversa(businessId, ator, c);
    const ok = await sendWhatsAppMessage(c.phone, texto, { businessId, origin: 'manual_painel', sentByUserId: ator.userId });
    if (!ok) throw new AppError('Não foi possível enviar a mensagem. Tente de novo.', 502, 'WHATSAPP_SEND_FAILED');
    await inboxRepository.zerarNaoLidas(businessId, [c.id]);
    return { enviado: true };
  },

  async assumir(businessId: string, ator: Ator, id: string): Promise<ConversaResumoDto> {
    const c = await carregar(businessId, id);
    exigirPodeAtender(c, ator);
    return resumoDe(businessId, await assumirConversa(businessId, ator, c));
  },

  async devolver(businessId: string, ator: Ator, id: string): Promise<ConversaResumoDto> {
    const c = await carregar(businessId, id);
    if (ator.role === 'employee' && c.assignedUserId !== null && c.assignedUserId !== ator.userId) throw new ForbiddenError(SEM_PERMISSAO);
    const atualizada = (await inboxRepository.atualizarConversa(c.id, { handler: 'bot', assignedUserId: null, status: 'aberta' })) as ConversaComRelacoes;
    await registrarEvento(businessId, c, 'Conversa devolvida ao robô');
    await deleteSession(c.phone, businessId);
    return resumoDe(businessId, atualizada);
  },

  async marcarLidas(businessId: string, ids?: string[]): Promise<{ atualizadas: number }> {
    return { atualizadas: await inboxRepository.zerarNaoLidas(businessId, ids) };
  },
};
