import type { Prisma, WhatsappEnvio } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { INTERVALO_MAX_S } from './fila.rules.js';
import type { EnvioDto } from './fila.service.js';

export type EnvioRow = WhatsappEnvio;
type StatusEnvio = EnvioDto['status'];
const STATUS_ENVIO: StatusEnvio[] = ['na_fila', 'enviando', 'enviado', 'falhou', 'pulado', 'cancelado'];
const STATUS_ATIVOS = ['na_fila', 'enviando'];
/** Linhas por INSERT no lote em massa (11 colunas: bem abaixo do limite de parâmetros do Postgres). */
const BLOCO_CRIACAO = 1000;

export interface NovoEnvio {
  businessId: string; clientId: string | null; phone: string; phoneKey: string; body: string;
  origin: string; scheduledFor: Date; batchId: string | null;
  priority: number; appointmentId: string | null;
}

export const filaRepository = {
  naFilaDoCliente(businessId: string, clientId: string, origin: string): Promise<EnvioRow | null> {
    return prisma.whatsappEnvio.findFirst({ where: { businessId, clientId, origin, status: { in: ['na_fila', 'enviando'] } } });
  },

  criar(data: NovoEnvio): Promise<EnvioRow> {
    return prisma.whatsappEnvio.create({ data });
  },

  /** Clientes com algum item ativo (na fila ou saindo) da origem no negócio; uma consulta só. */
  async clientesAtivosDaOrigem(businessId: string, origin: string): Promise<Set<string>> {
    const rows = await prisma.whatsappEnvio.findMany({
      where: { businessId, origin, status: { in: STATUS_ATIVOS }, clientId: { not: null } },
      select: { clientId: true },
    });
    return new Set(rows.flatMap((r) => (r.clientId ? [r.clientId] : [])));
  },

  /**
   * Cria em massa com ON CONFLICT DO NOTHING: quem bater no índice único parcial (cliente já ativa na fila
   * com a mesma origem) fica de fora sem derrubar o resto. Devolve quantas linhas entraram.
   */
  async criarVarios(linhas: Array<NovoEnvio & { createdAt: Date }>): Promise<number> {
    let total = 0;
    for (let i = 0; i < linhas.length; i += BLOCO_CRIACAO) {
      const r = await prisma.whatsappEnvio.createMany({ data: linhas.slice(i, i + BLOCO_CRIACAO), skipDuplicates: true });
      total += r.count;
    }
    return total;
  },

  /** Itens ativos (na fila ou saindo) do lote, na ordem de criação. */
  ativosDoLote(businessId: string, loteId: string): Promise<EnvioRow[]> {
    return prisma.whatsappEnvio.findMany({
      where: { businessId, batchId: loteId, status: { in: STATUS_ATIVOS } },
      orderBy: { createdAt: 'asc' },
    });
  },

  async negociosComVencidos(agora: Date): Promise<string[]> {
    const rows = await prisma.whatsappEnvio.findMany({
      where: { status: 'na_fila', scheduledFor: { lte: agora } },
      distinct: ['businessId'],
      select: { businessId: true },
    });
    return rows.map((r) => r.businessId);
  },

  async ultimoEnviado(businessId: string): Promise<{ sentAt: Date; intervalAfterS: number } | null> {
    const r = await prisma.whatsappEnvio.findFirst({
      where: { businessId, status: { in: ['enviado', 'enviando'] }, sentAt: { not: null } },
      orderBy: { sentAt: 'desc' },
      select: { sentAt: true, intervalAfterS: true },
    });
    return r?.sentAt ? { sentAt: r.sentAt, intervalAfterS: r.intervalAfterS ?? INTERVALO_MAX_S } : null;
  },

  contarEnviadosDesde(businessId: string, desde: Date): Promise<number> {
    return prisma.whatsappEnvio.count({ where: { businessId, status: { in: ['enviado', 'enviando'] }, sentAt: { gte: desde } } });
  },

  /** Ids da fila do negócio na ordem de envio (para a previsão). */
  async idsNaFila(businessId: string): Promise<string[]> {
    const rows = await prisma.whatsappEnvio.findMany({
      where: { businessId, status: 'na_fila' },
      orderBy: [{ priority: 'asc' }, { scheduledFor: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    return rows.map((r) => r.id);
  },

  /**
   * Próximo item vencido; `excluirLotes` deixa de fora os lotes que já bateram a cadência na última hora.
   * `semCampanhas` deixa de fora toda a origem campanha (a consulta das campanhas falhou nesta rodada).
   * `apenasOrigens` restringe às origens dadas (conta em carência); combina com `semCampanhas` na mesma chave.
   */
  proximoVencido(
    businessId: string, agora: Date, excluirLotes: string[] = [],
    opcoes: { semCampanhas?: boolean; apenasOrigens?: readonly string[] } = {},
  ): Promise<EnvioRow | null> {
    const origin: Prisma.StringFilter = {
      ...(opcoes.apenasOrigens ? { in: [...opcoes.apenasOrigens] } : {}),
      ...(opcoes.semCampanhas ? { not: 'campanha' } : {}),
    };
    return prisma.whatsappEnvio.findFirst({
      where: {
        businessId, status: 'na_fila', scheduledFor: { lte: agora },
        ...(Object.keys(origin).length ? { origin } : {}),
        ...(excluirLotes.length ? { OR: [{ batchId: null }, { batchId: { notIn: excluirLotes } }] } : {}),
      },
      orderBy: [{ priority: 'asc' }, { scheduledFor: 'asc' }, { createdAt: 'asc' }],
    });
  },

  /**
   * Campanhas do negócio em envio: agendadas, já iniciadas e com algum item ainda na fila ou saindo.
   * "Concluída" não é gravada (é derivada), então sem a checagem dos itens uma campanha terminada
   * continuaria contando para sempre. O id da campanha é o lote dos envios.
   */
  async cadenciasEmEnvio(businessId: string, agora: Date): Promise<Array<{ id: string; cadencia: number }>> {
    const candidatas = await prisma.whatsappCampanha.findMany({
      where: { businessId, status: 'agendada', inicioEm: { lte: agora } },
      select: { id: true, cadencia: true },
    });
    if (!candidatas.length) return [];
    // groupBy: o `distinct` do Prisma 5 traz todas as linhas pendentes e deduplica em memória.
    const pendentes = await prisma.whatsappEnvio.groupBy({
      by: ['batchId'],
      where: {
        businessId, origin: 'campanha', status: { in: STATUS_ATIVOS },
        batchId: { in: candidatas.map((c) => c.id) },
      },
    });
    const comPendentes = new Set(pendentes.map((p) => p.batchId));
    return candidatas.filter((c) => comPendentes.has(c.id));
  },

  /** Enviados (ou reservados) de cada lote desde `desde`. */
  async contarEnviadosDoLoteDesde(businessId: string, loteIds: string[], desde: Date): Promise<Map<string, number>> {
    if (!loteIds.length) return new Map();
    const rows = await prisma.whatsappEnvio.groupBy({
      by: ['batchId'],
      where: { businessId, batchId: { in: loteIds }, status: { in: ['enviado', 'enviando'] }, sentAt: { gte: desde } },
      _count: { _all: true },
    });
    const mapa = new Map<string, number>();
    for (const r of rows) if (r.batchId) mapa.set(r.batchId, r._count._all);
    return mapa;
  },

  /** Cancela o que ainda está na fila do lote (o que já saiu ou está saindo fica como está). */
  async cancelarDoLote(
    businessId: string, loteId: string, motivo: string, db: Prisma.TransactionClient = prisma,
  ): Promise<number> {
    const r = await db.whatsappEnvio.updateMany({
      where: { businessId, batchId: loteId, status: 'na_fila' },
      data: { status: 'cancelado', reason: motivo },
    });
    return r.count;
  },

  /** Contagem por status de cada lote, com zero nos status sem itens. */
  async contagemDoLote(businessId: string, loteIds: string[]): Promise<Map<string, Record<StatusEnvio, number>>> {
    const mapa = new Map<string, Record<StatusEnvio, number>>();
    if (!loteIds.length) return mapa;
    for (const id of loteIds) {
      mapa.set(id, Object.fromEntries(STATUS_ENVIO.map((s) => [s, 0])) as Record<StatusEnvio, number>);
    }
    const rows = await prisma.whatsappEnvio.groupBy({
      by: ['batchId', 'status'],
      where: { businessId, batchId: { in: loteIds } },
      _count: { _all: true },
    });
    for (const r of rows) {
      const c = r.batchId ? mapa.get(r.batchId) : undefined;
      if (c && r.status in c) c[r.status as StatusEnvio] = r._count._all;
    }
    return mapa;
  },

  /** Itens do lote com o nome da cliente, na ordem em que entraram na fila. */
  itensDoLote(businessId: string, loteId: string): Promise<Array<EnvioRow & { client: { name: string } | null }>> {
    return prisma.whatsappEnvio.findMany({
      where: { businessId, batchId: loteId },
      include: { client: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  },

  /** Reserva atômica na_fila -> enviando; false se outra rotina pegou a linha. */
  async reservar(businessId: string, id: string, agora: Date): Promise<boolean> {
    // sentAt guarda o instante da reserva enquanto 'enviando' (usado pelo reaper).
    const r = await prisma.whatsappEnvio.updateMany({
      where: { id, businessId, status: 'na_fila' },
      data: { status: 'enviando', sentAt: agora },
    });
    return r.count === 1;
  },

  async atualizar(
    businessId: string, id: string,
    data: { status: string; reason?: string | null; sentAt?: Date | null; intervalAfterS?: number },
  ): Promise<void> {
    await prisma.whatsappEnvio.updateMany({ where: { id, businessId }, data });
  },

  /** Linhas 'enviando' reservadas antes de `limite` (processo caiu ou a gravação final falhou). */
  async interromper(limite: Date, motivo: string): Promise<number> {
    const r = await prisma.whatsappEnvio.updateMany({
      where: { status: 'enviando', sentAt: { lt: limite } },
      data: { status: 'falhou', reason: motivo },
    });
    return r.count;
  },

  /** Último consentimento de lembretes da cliente: revogado (mesma regra do lembrete do cron). */
  async consentimentoRevogado(businessId: string, clientId: string): Promise<boolean> {
    const c = await prisma.clientConsent.findFirst({
      where: { businessId, clientId, kind: 'whatsapp_lembretes' },
      orderBy: { grantedAt: 'desc' },
      select: { granted: true, revokedAt: true },
    });
    return !!c && (!c.granted || !!c.revokedAt);
  },

  /** Dados do agendamento vinculado ao envio (status, data/hora e se já foi avaliado). */
  async agendamentoParaEnvio(businessId: string, appointmentId: string): Promise<{ status: string; date: Date; time: Date; jaAvaliou: boolean } | null> {
    const a = await prisma.appointment.findFirst({
      where: { id: appointmentId, businessId },
      select: { status: true, date: true, time: true, whatsappRating: { select: { id: true } } },
    });
    return a ? { status: a.status, date: a.date, time: a.time, jaAvaliou: !!a.whatsappRating } : null;
  },

  /** O lembrete na véspera não saiu: o agendamento volta a contar como não lembrado. */
  async desmarcarLembrete(businessId: string, appointmentId: string): Promise<void> {
    await prisma.appointment.updateMany({ where: { id: appointmentId, businessId }, data: { reminderSent: false } });
  },

  recentesPorCliente(businessId: string, origin: string, clientIds: string[]): Promise<EnvioRow[]> {
    if (!clientIds.length) return Promise.resolve([]);
    return prisma.whatsappEnvio.findMany({
      where: { businessId, origin, clientId: { in: clientIds } },
      orderBy: { createdAt: 'desc' },
    });
  },

  /** Envios com status `enviado` (mais recentes primeiro), para achar o último convite realmente enviado. */
  enviadosPorCliente(businessId: string, origin: string, clientIds: string[]): Promise<EnvioRow[]> {
    if (!clientIds.length) return Promise.resolve([]);
    return prisma.whatsappEnvio.findMany({
      where: { businessId, origin, status: 'enviado', clientId: { in: clientIds } },
      orderBy: { sentAt: 'desc' },
    });
  },
};
