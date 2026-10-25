import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import type { ContratoParaCobertura, StatusContrato, TipoOferta } from './clube.rules.js';
import type { ListaContratosQuery, OfertaInput } from './clube.types.js';

type Db = Prisma.TransactionClient | typeof prisma;

const data = (d: string) => new Date(`${d}T00:00:00Z`);
const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
export const STATUS_VIGENTES: StatusContrato[] = ['aguardando_pagamento', 'ativo', 'em_atraso'];
export const POR_PAGINA = 20;

const OFERTA_SELECT = {
  id: true, tipo: true, nome: true, descricao: true, preco: true, sessoesPorCiclo: true, sessoesReferencia: true,
  intervaloMinimoDias: true, totalSessoes: true, validadeDias: true, faltaDebita: true, descontoExtrasPct: true,
  beneficios: true, publica: true, status: true, createdAt: true,
  servicos: { select: { service: { select: { id: true, name: true } } } },
  profissionais: { select: { professional: { select: { id: true, name: true } } } },
} as const;
export type OfertaRow = Prisma.ClubeOfertaGetPayload<{ select: typeof OFERTA_SELECT }>;

const CONTRATO_SELECT = {
  id: true, tipo: true, status: true, origem: true, preco: true, valorSessao: true, sessoesPorCiclo: true,
  intervaloMinimoDias: true, totalSessoes: true, sessoesUsadas: true, validadeDias: true, ativadoEm: true,
  cicloInicio: true, cicloFim: true, validoAte: true, cancelaEm: true, canceladoEm: true, createdAt: true,
  ofertaId: true, clientId: true, businessId: true,
  oferta: { select: { id: true, nome: true, descontoExtrasPct: true, faltaDebita: true } },
  client: { select: { id: true, name: true, phone: true } },
  cobrancas: { orderBy: { competencia: 'desc' as const }, take: 3 },
} as const;
export type ContratoRow = Prisma.ClubeContratoGetPayload<{ select: typeof CONTRATO_SELECT }>;

const dadosOferta = (o: OfertaInput) => ({
  tipo: o.tipo, nome: o.nome, descricao: o.descricao ?? null, preco: o.preco,
  sessoesPorCiclo: o.tipo === 'clube' ? (o.sessoesPorCiclo ?? null) : null,
  sessoesReferencia: o.sessoesReferencia,
  intervaloMinimoDias: o.intervaloMinimoDias,
  totalSessoes: o.tipo === 'pacote' ? (o.totalSessoes ?? null) : null,
  validadeDias: o.tipo === 'pacote' ? (o.validadeDias ?? null) : null,
  faltaDebita: o.faltaDebita, descontoExtrasPct: o.descontoExtrasPct, beneficios: o.beneficios,
  publica: o.tipo === 'clube' && o.publica,
});

export const clubeRepository = {
  data, ymd,

  transacao<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
    return prisma.$transaction(fn);
  },

  /** Lock de transação por contrato: uso, confirmação e rotina não se cruzam no mesmo contrato. */
  async travarContrato(tx: Prisma.TransactionClient, contratoId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`clube|${contratoId}`}::text))`;
  },

  async travarAdesao(tx: Prisma.TransactionClient, chave: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`clube-adesao|${chave}`}::text))`;
  },

  // ─── Ofertas ───────────────────────────────────────────────────────────
  listarOfertas(businessId: string, filtro: { incluirArquivadas?: boolean; publicas?: boolean } = {}) {
    return prisma.clubeOferta.findMany({
      where: {
        businessId,
        ...(filtro.publicas ? { publica: true, status: 'ativa', tipo: 'clube' } : {}),
        ...(filtro.incluirArquivadas ? {} : { status: { not: 'arquivada' } }),
      },
      select: OFERTA_SELECT,
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    });
  },

  buscarOferta(businessId: string, id: string) {
    return prisma.clubeOferta.findFirst({ where: { id, businessId }, select: OFERTA_SELECT });
  },

  /** Contratos vigentes e receita mensal (clube: mensalidade; pacote: vendas dos últimos 30 dias) por oferta. */
  async contadoresPorOferta(businessId: string, desde: Date) {
    const [ativos, vendas] = await Promise.all([
      prisma.clubeContrato.groupBy({
        by: ['ofertaId', 'tipo'], where: { businessId, status: { in: ['ativo', 'em_atraso'] } },
        _count: { _all: true }, _sum: { preco: true },
      }),
      prisma.$queryRaw<Array<{ oferta_id: string; total: unknown }>>`
        SELECT c.oferta_id, SUM(b.valor) AS total
          FROM clube_cobrancas b JOIN clube_contratos c ON c.id = b.contrato_id
         WHERE b.business_id = ${businessId}::uuid AND b.status = 'paga' AND c.tipo = 'pacote' AND b.pago_em >= ${desde}
         GROUP BY c.oferta_id`,
    ]);
    const m = new Map<string, { ativos: number; receita: number }>();
    for (const a of ativos) {
      m.set(a.ofertaId, { ativos: a._count._all, receita: a.tipo === 'clube' ? Number(a._sum.preco ?? 0) : 0 });
    }
    for (const v of vendas) {
      const atual = m.get(v.oferta_id) ?? { ativos: 0, receita: 0 };
      atual.receita += Number(v.total ?? 0);
      m.set(v.oferta_id, atual);
    }
    return m;
  },

  async idsValidos(businessId: string, servicos: string[], profissionais: string[]) {
    const [s, p] = await Promise.all([
      prisma.service.findMany({ where: { businessId, id: { in: servicos } }, select: { id: true } }),
      profissionais.length
        ? prisma.professional.findMany({ where: { businessId, id: { in: profissionais } }, select: { id: true } })
        : Promise.resolve([]),
    ]);
    return { servicos: s.length === new Set(servicos).size, profissionais: p.length === new Set(profissionais).size };
  },

  criarOferta(businessId: string, o: OfertaInput) {
    return prisma.clubeOferta.create({
      data: {
        businessId, ...dadosOferta(o),
        servicos: { create: [...new Set(o.servicos)].map((serviceId) => ({ serviceId })) },
        profissionais: { create: [...new Set(o.profissionais)].map((professionalId) => ({ professionalId })) },
      },
      select: OFERTA_SELECT,
    });
  },

  editarOferta(businessId: string, id: string, o: OfertaInput) {
    return prisma.$transaction(async (tx) => {
      const r = await tx.clubeOferta.updateMany({ where: { id, businessId }, data: dadosOferta(o) });
      if (r.count !== 1) return null;
      await tx.clubeOfertaServico.deleteMany({ where: { ofertaId: id } });
      await tx.clubeOfertaProfissional.deleteMany({ where: { ofertaId: id } });
      await tx.clubeOfertaServico.createMany({ data: [...new Set(o.servicos)].map((serviceId) => ({ ofertaId: id, serviceId })) });
      if (o.profissionais.length) {
        await tx.clubeOfertaProfissional.createMany({ data: [...new Set(o.profissionais)].map((professionalId) => ({ ofertaId: id, professionalId })) });
      }
      return tx.clubeOferta.findUnique({ where: { id }, select: OFERTA_SELECT });
    });
  },

  async mudarStatusOferta(businessId: string, id: string, status: string) {
    const r = await prisma.clubeOferta.updateMany({ where: { id, businessId }, data: { status } });
    return r.count === 1;
  },

  // ─── Contratos ─────────────────────────────────────────────────────────
  CONTRATO_SELECT,

  buscarContrato(db: Db, businessId: string, id: string) {
    return db.clubeContrato.findFirst({ where: { id, businessId }, select: CONTRATO_SELECT });
  },

  temContratoVigente(db: Db, businessId: string, clientId: string, ofertaId: string) {
    return db.clubeContrato.findFirst({
      where: { businessId, clientId, ofertaId, status: { in: STATUS_VIGENTES } },
      select: { id: true, status: true },
    });
  },

  async listarContratos(businessId: string, q: ListaContratosQuery) {
    const where: Prisma.ClubeContratoWhereInput = {
      businessId,
      ...(q.tipo ? { tipo: q.tipo } : {}),
      ...(q.status ? { status: q.status } : { status: { in: [...STATUS_VIGENTES, 'cancelado'] } }),
      ...(q.busca ? {
        OR: [
          { client: { name: { contains: q.busca, mode: 'insensitive' } } },
          { client: { phone: { contains: q.busca.replace(/\D/g, '') || q.busca } } },
          { oferta: { nome: { contains: q.busca, mode: 'insensitive' } } },
        ],
      } : {}),
    };
    const [itens, total] = await Promise.all([
      prisma.clubeContrato.findMany({
        where, select: CONTRATO_SELECT, orderBy: [{ createdAt: 'desc' }],
        skip: (q.pagina - 1) * POR_PAGINA, take: POR_PAGINA,
      }),
      prisma.clubeContrato.count({ where }),
    ]);
    return { itens, total };
  },

  todosContratos(businessId: string) {
    return prisma.clubeContrato.findMany({
      where: { businessId }, select: CONTRATO_SELECT, orderBy: [{ createdAt: 'desc' }], take: 5000,
    });
  },

  async indicadores(businessId: string, hoje: string, em30: string) {
    const [ativos, emAtraso, cancelam] = await Promise.all([
      prisma.clubeContrato.findMany({ where: { businessId, status: 'ativo' }, select: { tipo: true, preco: true } }),
      prisma.clubeContrato.count({ where: { businessId, status: 'em_atraso' } }),
      prisma.clubeContrato.count({ where: { businessId, status: 'cancelado', cancelaEm: { gte: data(hoje), lte: data(em30) } } }),
    ]);
    const receitaMensal = ativos.filter((a) => a.tipo === 'clube').reduce((t, a) => t + Math.round(Number(a.preco) * 100), 0) / 100;
    return { ativos: ativos.length, receitaMensal, emAtraso, cancelam30dias: cancelam };
  },

  contratosDoCliente(businessId: string, clientId: string) {
    return prisma.clubeContrato.findMany({
      where: { businessId, clientId }, select: CONTRATO_SELECT, orderBy: [{ createdAt: 'desc' }], take: 20,
    });
  },

  /**
   * Contratos da cliente que podem cobrir um atendimento, com o que a regra precisa:
   * serviços e profissionais da oferta (como estão hoje), usos do ciclo e o último uso.
   */
  async paraCobertura(db: Db, businessId: string, clientId: string, filtro: { ids?: string[]; faltaDebita?: boolean } = {}) {
    const contratos = await db.clubeContrato.findMany({
      where: {
        businessId, clientId, status: { in: ['aguardando_pagamento', 'ativo', 'em_atraso', 'cancelado'] },
        ...(filtro.ids ? { id: { in: filtro.ids } } : {}),
        ...(filtro.faltaDebita ? { oferta: { faltaDebita: true } } : {}),
      },
      select: {
        id: true, tipo: true, status: true, valorSessao: true, sessoesPorCiclo: true, totalSessoes: true,
        sessoesUsadas: true, intervaloMinimoDias: true, cicloInicio: true, cicloFim: true, validoAte: true,
        validadeDias: true,
        oferta: {
          select: {
            nome: true, descontoExtrasPct: true,
            servicos: { select: { serviceId: true } }, profissionais: { select: { professionalId: true } },
          },
        },
      },
    });
    // Cancelado só interessa enquanto o ciclo pago do clube não acabou.
    const uteis = contratos.filter((c) => c.status !== 'cancelado' || (c.tipo === 'clube' && c.cicloFim));
    const saida: Array<ContratoParaCobertura & { descontoExtrasPct: number; validadeDias: number | null }> = [];
    for (const c of uteis) {
      const [noCiclo, ultimo] = await Promise.all([
        c.tipo === 'clube' && c.cicloInicio && c.cicloFim
          ? db.clubeUso.count({ where: { contratoId: c.id, data: { gte: c.cicloInicio, lte: c.cicloFim } } })
          : Promise.resolve(0),
        db.clubeUso.findFirst({ where: { contratoId: c.id }, orderBy: { data: 'desc' }, select: { data: true } }),
      ]);
      saida.push({
        id: c.id, tipo: c.tipo as TipoOferta, status: c.status as StatusContrato, nome: c.oferta.nome,
        valorSessao: Number(c.valorSessao), sessoesPorCiclo: c.sessoesPorCiclo, totalSessoes: c.totalSessoes,
        sessoesUsadas: c.sessoesUsadas, intervaloMinimoDias: c.intervaloMinimoDias,
        cicloInicio: ymd(c.cicloInicio), cicloFim: ymd(c.cicloFim), validoAte: ymd(c.validoAte),
        servicos: c.oferta.servicos.map((s) => s.serviceId),
        profissionais: c.oferta.profissionais.map((p) => p.professionalId),
        usosNoCiclo: noCiclo, ultimoUso: ymd(ultimo?.data ?? null),
        descontoExtrasPct: Number(c.oferta.descontoExtrasPct), validadeDias: c.validadeDias,
      });
    }
    return saida;
  },

  async usosNoCiclo(contratoIds: string[]) {
    if (contratoIds.length === 0) return new Map<string, number>();
    const linhas = await prisma.$queryRaw<Array<{ contrato_id: string; n: bigint }>>`
      SELECT u.contrato_id, COUNT(*) AS n
        FROM clube_usos u JOIN clube_contratos c ON c.id = u.contrato_id
       WHERE u.contrato_id IN (${Prisma.join(contratoIds.map((id) => Prisma.sql`${id}::uuid`))})
         AND c.ciclo_inicio IS NOT NULL AND u.data BETWEEN c.ciclo_inicio AND c.ciclo_fim
       GROUP BY u.contrato_id`;
    return new Map(linhas.map((l) => [l.contrato_id, Number(l.n)]));
  },

  // ─── Rotina ────────────────────────────────────────────────────────────
  negociosComContratos() {
    return prisma.clubeContrato.findMany({
      where: { status: { in: ['aguardando_pagamento', 'ativo', 'em_atraso'] } },
      distinct: ['businessId'], select: { businessId: true },
    });
  },

  clubesARenovar(businessId: string, ateCicloFim: string) {
    return prisma.clubeContrato.findMany({
      where: { businessId, tipo: 'clube', status: { in: ['ativo', 'em_atraso'] }, cicloFim: { lte: data(ateCicloFim) } },
      select: CONTRATO_SELECT,
    });
  },

  async marcarAtraso(businessId: string, cicloFimAntesDe: string) {
    return prisma.clubeContrato.findMany({
      where: { businessId, tipo: 'clube', status: 'ativo', cicloFim: { lt: data(cicloFimAntesDe) } },
      select: { id: true, cicloFim: true, client: { select: { name: true } }, oferta: { select: { nome: true } } },
    });
  },

  async expirarPacotes(businessId: string, hoje: string) {
    const r = await prisma.clubeContrato.updateMany({
      where: { businessId, tipo: 'pacote', status: 'ativo', validoAte: { lt: data(hoje) } },
      data: { status: 'expirado' },
    });
    return r.count;
  },

  adesoesVencidas(businessId: string, antesDe: Date) {
    return prisma.clubeContrato.findMany({
      where: { businessId, status: 'aguardando_pagamento', createdAt: { lt: antesDe } },
      select: { id: true },
    });
  },

  // ─── Cobranças ─────────────────────────────────────────────────────────
  buscarCobranca(db: Db, businessId: string, id: string) {
    return db.clubeCobranca.findFirst({ where: { id, businessId } });
  },

  pendenteDoContrato(db: Db, contratoId: string) {
    return db.clubeCobranca.findFirst({ where: { contratoId, status: 'pendente' }, orderBy: { competencia: 'asc' } });
  },

  /** Recebimentos confirmados que entram no Caixa do dia: da sessão, ou sem sessão e pagos no dia. */
  recebimentosDoCaixa(businessId: string, sessionId: string | null, intervalo: { gte: Date; lt: Date }) {
    return prisma.clubeCobranca.findMany({
      where: {
        businessId, status: 'paga',
        OR: [
          ...(sessionId ? [{ cashSessionId: sessionId }] : []),
          { cashSessionId: null, pagoEm: intervalo },
        ],
      },
      select: {
        id: true, valor: true, forma: true, pagoEm: true,
        contrato: { select: { tipo: true, client: { select: { name: true, phone: true } }, oferta: { select: { nome: true } } } },
      },
      orderBy: { pagoEm: 'asc' },
    });
  },

  recebimentos(businessId: string, intervalo: { gte: Date; lt: Date }) {
    return prisma.clubeCobranca.findMany({
      where: { businessId, status: 'paga', pagoEm: intervalo },
      select: { valor: true, pagoEm: true },
    });
  },

  sessaoDeCaixa(db: Db, businessId: string, dia: string) {
    return db.cashSession.findFirst({ where: { businessId, date: data(dia) }, select: { id: true, closedAt: true } });
  },

  negocioParaPix(businessId: string) {
    return prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, name: true, slug: true, pixKey: true, pixKeyType: true, plan: true, subscriptionStatus: true },
    });
  },
};
