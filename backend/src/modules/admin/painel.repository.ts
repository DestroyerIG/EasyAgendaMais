import { valorCombinadoDe } from '../../config/valorPlano.js';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { inicioDoMes, type LinhaNegocio } from './painel.rules.js';

// Leitura do painel do SuperAdmin: uma linha por negócio (ativo ou não), com os agregados das três telas.
// O status de cobrança NÃO é calculado aqui: vem de painel.rules.ts (calcularEstadoConta, H1).

/**
 * CTE `pagamentos(business_id, pago_em timestamptz, valor numeric, tipo text)`: todo pagamento
 * confirmado, de billing_payments (Pix/Asaas) ou de eventos de fatura paga do gateway (valor em centavos).
 * O webhook grava invoice.paid e invoice.payment_succeeded para a mesma fatura: o ramo do gateway
 * fica com um evento por fatura (payload->>'id'), o mais antigo. `tipo` vem de billing_payments
 * (mensalidade, upgrade...) e é nulo no gateway.
 * Usado como `WITH ${SQL_PAGAMENTOS_CONFIRMADOS}, ...`.
 */
export const SQL_PAGAMENTOS_CONFIRMADOS = Prisma.sql`
  pagamentos AS (
    SELECT bp.business_id,
           bp.paid_at AT TIME ZONE 'UTC' AS pago_em,
           bp.amount::numeric AS valor,
           bp.tipo AS tipo
    FROM billing_payments bp
    WHERE bp.paid_at IS NOT NULL
  )
`;

type LinhaCrua = Record<string, unknown>;

export type CategoriaAuditoria = 'todos' | 'financeiro' | 'sistema' | 'operador';

export interface ExtrasNegocio {
  slug: string | null;
  suspensoMotivo: string | null;
  temAssinaturaGateway: boolean;
  usuarioDonoId: string | null;
  proximoVencimento: Date | null;
}

export interface UsoNegocio {
  profissionaisAtivas: number;
  agendamentosMes: number;
  agendamentosComSinalMes: number;
  clientes: number;
  clientesNovosMes: number;
  lembretesLigados: boolean;
  enviosMes: { enviados: number; falhos: number };
}

export interface RegistroAuditoria {
  id: string; criadoEm: Date; acao: string; status: string;
  ator: string | null; detalhes: unknown; ip: string | null;
}

const FILTRO_CATEGORIA: Record<CategoriaAuditoria, Prisma.Sql> = {
  todos: Prisma.empty,
  financeiro: Prisma.sql`AND a.action_type ~ '^(SUBSCRIPTION|TRIAL|BILLING)'`,
  sistema: Prisma.sql`AND a.actor_user_id IS NULL`,
  operador: Prisma.sql`AND u.role = 'platform_admin'`,
};

const bool = (v: unknown): boolean => v === true || v === 't' || v === 'true' || v === 1;
const data = (v: unknown): Date | null => (v instanceof Date ? v : v ? new Date(String(v)) : null);
const texto = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

function paraLinha(r: LinhaCrua): LinhaNegocio {
  return {
    id: String(r.id),
    nome: String(r.name ?? ''),
    dono: String(r.owner_name ?? ''),
    email: String(r.email ?? ''),
    whatsapp: String(r.whatsapp ?? ''),
    cpfCnpj: texto(r.cpf_cnpj),
    endereco: texto(r.address),
    segmento: texto(r.segment),
    plano: String(r.plan ?? ''),
    statusAssinatura: String(r.subscription_status ?? ''),
    ativo: bool(r.active),
    inadimplenteDesde: data(r.inadimplente_desde),
    jaPagou: bool(r.ja_pagou),
    cartaoCadastrado: bool(r.cartao_cadastrado),
    valorCombinado: valorCombinadoDe(r.metadata),
    fimDoPeriodo: data(r.fim_do_periodo),
    criadoEm: data(r.created_at) as Date,
    canceladoEm: data(r.canceled_at),
    onboardingConcluido: bool(r.onboarding_concluido),
    temInstanciaWhatsapp: bool(r.tem_instancia_whatsapp),
    whatsappConectadoEm: data(r.whatsapp_connected_at),
    ultimoEnvioEm: data(r.ultimo_envio_em),
    agendamentos30d: Number(r.agendamentos_30d ?? 0),
    ultimoAgendamentoEm: data(r.ultimo_agendamento_em),
    primeiroPagamentoEm: data(r.primeiro_pagamento_em),
    pagouMesAnterior: bool(r.pagou_mes_anterior),
  };
}

async function consultar(id?: string): Promise<LinhaNegocio[]> {
  // A lista (telas, cartões e MRR) não conta o negócio ligado a um platform_admin: é o da própria
  // plataforma, não um cliente. O detalhe por id continua abrindo qualquer negócio.
  const filtro = id === undefined
    ? Prisma.sql`WHERE NOT EXISTS (SELECT 1 FROM users ua WHERE ua.business_id = b.id AND ua.role = 'platform_admin')`
    : Prisma.sql`WHERE b.id = ${id}::uuid`;
  const rows = await prisma.$queryRaw<LinhaCrua[]>(Prisma.sql`
    WITH ${SQL_PAGAMENTOS_CONFIRMADOS}
    SELECT b.id, b.name, b.owner_name, b.email, b.whatsapp, b.cpf_cnpj, b.address,
           s.segment,
           b.plan, b.subscription_status, b.active,
           b.inadimplente_desde,
           (b.last_payment_date IS NOT NULL
             OR EXISTS (SELECT 1 FROM billing_payments bp WHERE bp.business_id = b.id AND bp.paid_at IS NOT NULL)) AS ja_pagou,
           -- No teste vale subscription_current_period_end: é a coluna que estenderTeste grava e o cron lê.
           CASE WHEN b.subscription_status = 'trialing'
             THEN COALESCE(
               b.subscription_current_period_end AT TIME ZONE 'UTC',
               b.current_period_end AT TIME ZONE 'UTC'
             )
             ELSE COALESCE(
               b.current_period_end AT TIME ZONE 'UTC',
               b.subscription_current_period_end AT TIME ZONE 'UTC'
             )
           END AS fim_do_periodo,
           b.provider, b.payment_method, b.metadata,
           (b.payment_method = 'card' AND b.provider_subscription_id IS NOT NULL
             AND NOT COALESCE(b.subscription_cancel_at_period_end, false)) AS cartao_cadastrado,
           b.created_at AT TIME ZONE 'UTC' AS created_at,
           b.canceled_at AT TIME ZONE 'UTC' AS canceled_at,
           (b.onboarding_concluido_em IS NOT NULL) AS onboarding_concluido,
           (b.whatsapp_instance_name IS NOT NULL) AS tem_instancia_whatsapp,
           b.whatsapp_connected_at,
           ap.agendamentos_30d, ap.ultimo_agendamento_em,
           wz.ultimo_envio_em,
           pg.primeiro_pagamento_em, pg.pagou_mes_anterior
    FROM businesses b
    LEFT JOIN business_settings s ON s.business_id = b.id
    LEFT JOIN LATERAL (
      SELECT COUNT(*) FILTER (WHERE a.created_at AT TIME ZONE 'UTC' >= now() - interval '30 days') AS agendamentos_30d,
             MAX(a.created_at AT TIME ZONE 'UTC') AS ultimo_agendamento_em
      FROM appointments a
      WHERE a.business_id = b.id
    ) ap ON true
    LEFT JOIN LATERAL (
      SELECT MAX(w.enviado_em) AS ultimo_envio_em
      FROM whatsapp_envios w
      WHERE w.business_id = b.id AND w.status = 'enviado'
    ) wz ON true
    LEFT JOIN LATERAL (
      SELECT MIN(p.pago_em) AS primeiro_pagamento_em,
             COALESCE(bool_or(
               p.pago_em >= (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') - interval '1 month') AT TIME ZONE 'America/Sao_Paulo'
               AND p.pago_em < date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
             ), false) AS pagou_mes_anterior
      FROM pagamentos p
      WHERE p.business_id = b.id
    ) pg ON true
    ${filtro}
    ORDER BY b.created_at DESC
  `);
  return rows.map(paraLinha);
}

export const painelRepository = {
  linhasNegocios(): Promise<LinhaNegocio[]> {
    return consultar();
  },
  async linhaNegocio(id: string): Promise<LinhaNegocio | null> {
    const linhas = await consultar(id);
    return linhas[0] ?? null;
  },
  /** Envios de WhatsApp criados nas últimas 24 h, por origem. created_at é timestamptz. */
  async disparos24h(): Promise<Array<{ origem: string; enviados: number; falhos: number }>> {
    const rows = await prisma.$queryRaw<LinhaCrua[]>(Prisma.sql`
      SELECT w.origin AS origem,
             COUNT(*) FILTER (WHERE w.status = 'enviado') AS enviados,
             COUNT(*) FILTER (WHERE w.status = 'falhou') AS falhos
      FROM whatsapp_envios w
      WHERE w.created_at >= now() - interval '24 hours'
      GROUP BY w.origin
      ORDER BY w.origin
    `);
    return rows.map((r) => ({
      origem: String(r.origem ?? ''),
      enviados: Number(r.enviados ?? 0),
      falhos: Number(r.falhos ?? 0),
    }));
  },

  /**
   * Campos do detalhe que não estão em LinhaNegocio. O dono é o mesmo usuário escolhido pela
   * antiga consulta de detalhe: tenant_admin primeiro, depois admin, depois o mais antigo.
   */
  async extrasNegocio(id: string): Promise<ExtrasNegocio | null> {
    const rows = await prisma.$queryRaw<LinhaCrua[]>(Prisma.sql`
      SELECT b.slug, b.suspended_reason,
             (b.provider_subscription_id IS NOT NULL) AS tem_assinatura_gateway,
             b.next_due_date AT TIME ZONE 'UTC' AS proximo_vencimento,
             dono.id AS usuario_dono_id
      FROM businesses b
      LEFT JOIN LATERAL (
        SELECT u.id
        FROM users u
        WHERE u.business_id = b.id
        ORDER BY CASE WHEN u.role = 'tenant_admin' THEN 0 WHEN u.role = 'admin' THEN 1 ELSE 2 END,
                 u.created_at ASC
        LIMIT 1
      ) dono ON true
      WHERE b.id = ${id}::uuid
    `);
    const r = rows[0];
    if (!r) return null;
    return {
      slug: texto(r.slug),
      suspensoMotivo: texto(r.suspended_reason),
      temAssinaturaGateway: bool(r.tem_assinatura_gateway),
      usuarioDonoId: texto(r.usuario_dono_id),
      proximoVencimento: data(r.proximo_vencimento),
    };
  },

  /**
   * LTV: soma dos pagamentos confirmados do negócio (mesmo CTE do painel). O total soma tudo;
   * os ciclos não contam a cobrança avulsa de upgrade, que não é um mês pago.
   */
  async ltv(id: string): Promise<{ total: number; ciclos: number; desde: Date | null }> {
    const rows = await prisma.$queryRaw<LinhaCrua[]>(Prisma.sql`
      WITH ${SQL_PAGAMENTOS_CONFIRMADOS}
      SELECT COALESCE(SUM(p.valor), 0) AS total,
             COUNT(*) FILTER (WHERE p.tipo IS DISTINCT FROM 'upgrade') AS ciclos,
             MIN(p.pago_em) AS desde
      FROM pagamentos p
      WHERE p.business_id = ${id}::uuid
    `);
    const r = rows[0] ?? {};
    return { total: Number(r.total ?? 0), ciclos: Number(r.ciclos ?? 0), desde: data(r.desde) };
  },

  /** Uso do negócio. "Mês" é o mês local (America/Sao_Paulo), a partir de inicioDoMes. */
  async uso(id: string): Promise<UsoNegocio> {
    // Cast explícito: comparado com timestamptz (ou timestamp já convertido de UTC).
    const inicio = Prisma.sql`${inicioDoMes(new Date()).toISOString()}::timestamptz`;
    const rows = await prisma.$queryRaw<LinhaCrua[]>(Prisma.sql`
      SELECT
        (SELECT COUNT(*) FROM professionals p WHERE p.business_id = ${id}::uuid AND p.active = true) AS profissionais_ativas,
        (SELECT COUNT(*) FROM appointments a
          WHERE a.business_id = ${id}::uuid AND a.created_at AT TIME ZONE 'UTC' >= ${inicio}) AS agendamentos_mes,
        (SELECT COUNT(*) FROM appointments a
          WHERE a.business_id = ${id}::uuid AND a.created_at AT TIME ZONE 'UTC' >= ${inicio}
            AND a.deposit_amount > 0) AS agendamentos_com_sinal_mes,
        (SELECT COUNT(*) FROM clients c WHERE c.business_id = ${id}::uuid AND c.active = true) AS clientes,
        (SELECT COUNT(*) FROM clients c
          WHERE c.business_id = ${id}::uuid AND c.active = true
            AND c.created_at AT TIME ZONE 'UTC' >= ${inicio}) AS clientes_novos_mes,
        (SELECT s.whatsapp_reminders FROM business_settings s WHERE s.business_id = ${id}::uuid) AS lembretes_ligados,
        (SELECT COUNT(*) FROM whatsapp_envios w
          WHERE w.business_id = ${id}::uuid AND w.status = 'enviado' AND w.enviado_em >= ${inicio}) AS enviados_mes,
        (SELECT COUNT(*) FROM whatsapp_envios w
          WHERE w.business_id = ${id}::uuid AND w.status = 'falhou' AND w.created_at >= ${inicio}) AS falhos_mes
    `);
    const r = rows[0] ?? {};
    return {
      profissionaisAtivas: Number(r.profissionais_ativas ?? 0),
      agendamentosMes: Number(r.agendamentos_mes ?? 0),
      agendamentosComSinalMes: Number(r.agendamentos_com_sinal_mes ?? 0),
      clientes: Number(r.clientes ?? 0),
      clientesNovosMes: Number(r.clientes_novos_mes ?? 0),
      lembretesLigados: bool(r.lembretes_ligados),
      enviosMes: { enviados: Number(r.enviados_mes ?? 0), falhos: Number(r.falhos_mes ?? 0) },
    };
  },

  /** Auditoria do negócio (target_business_id), do mais recente para o mais antigo. */
  async auditoria(
    id: string, categoria: CategoriaAuditoria, page: number, limit: number,
  ): Promise<{ data: RegistroAuditoria[]; total: number }> {
    const filtro = FILTRO_CATEGORIA[categoria];
    const [rows, contagem] = await Promise.all([
      prisma.$queryRaw<LinhaCrua[]>(Prisma.sql`
        SELECT a.id, a.created_at AT TIME ZONE 'UTC' AS criado_em, a.action_type, a.status,
               u.email AS ator, a.details, a.ip_address
        FROM audit_logs a
        LEFT JOIN users u ON u.id = a.actor_user_id
        WHERE a.target_business_id = ${id}::uuid ${filtro}
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT ${limit} OFFSET ${(page - 1) * limit}
      `),
      prisma.$queryRaw<LinhaCrua[]>(Prisma.sql`
        SELECT COUNT(*) AS total
        FROM audit_logs a
        LEFT JOIN users u ON u.id = a.actor_user_id
        WHERE a.target_business_id = ${id}::uuid ${filtro}
      `),
    ]);
    return {
      data: rows.map((r) => ({
        id: String(r.id),
        criadoEm: data(r.criado_em) as Date,
        acao: String(r.action_type ?? ''),
        status: String(r.status ?? ''),
        ator: texto(r.ator),
        detalhes: r.details ?? null,
        ip: texto(r.ip_address),
      })),
      total: Number(contagem[0]?.total ?? 0),
    };
  },
};
