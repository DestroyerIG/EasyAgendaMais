import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import type { LinhaNegocio } from './painel.rules.js';

// Leitura do painel do SuperAdmin: uma linha por negócio (ativo ou não), com os agregados das três telas.
// O status de cobrança NÃO é calculado aqui: vem de painel.rules.ts (calcularEstadoConta, H1).

/**
 * CTE `pagamentos(business_id, pago_em timestamptz, valor numeric)`: todo pagamento confirmado,
 * de billing_payments (Pix/Asaas) ou de eventos de fatura paga do gateway (valor em centavos).
 * Usado como `WITH ${SQL_PAGAMENTOS_CONFIRMADOS}, ...`.
 */
export const SQL_PAGAMENTOS_CONFIRMADOS = Prisma.sql`
  pagamentos AS (
    SELECT bp.business_id,
           bp.paid_at AT TIME ZONE 'UTC' AS pago_em,
           bp.amount::numeric AS valor
    FROM billing_payments bp
    WHERE bp.paid_at IS NOT NULL
    UNION ALL
    SELECT se.business_id,
           se.created_at AT TIME ZONE 'UTC' AS pago_em,
           (CASE WHEN se.payload->>'amount_paid' ~ '^[0-9]+([.][0-9]+)?$'
                 THEN (se.payload->>'amount_paid')::numeric ELSE 0 END) / 100 AS valor
    FROM subscription_events se
    WHERE se.event_type IN ('invoice.paid','invoice.payment_succeeded')
      AND CASE WHEN se.payload->>'amount_paid' ~ '^[0-9]+([.][0-9]+)?$'
               THEN (se.payload->>'amount_paid')::numeric ELSE 0 END > 0
  )
`;

type LinhaCrua = Record<string, unknown>;

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
    fimDoPeriodo: data(r.fim_do_periodo),
    pix: r.provider === 'asaas' || r.payment_method === 'pix',
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
  const filtro = id === undefined ? Prisma.empty : Prisma.sql`WHERE b.id = ${id}::uuid`;
  const rows = await prisma.$queryRaw<LinhaCrua[]>(Prisma.sql`
    WITH ${SQL_PAGAMENTOS_CONFIRMADOS}
    SELECT b.id, b.name, b.owner_name, b.email, b.whatsapp, b.cpf_cnpj, b.address,
           s.segment,
           b.plan, b.subscription_status, b.active,
           b.inadimplente_desde,
           (b.last_payment_date IS NOT NULL
             OR EXISTS (SELECT 1 FROM billing_payments bp WHERE bp.business_id = b.id AND bp.paid_at IS NOT NULL)
             OR EXISTS (SELECT 1 FROM subscription_events se WHERE se.business_id = b.id
                        AND se.event_type IN ('invoice.paid','invoice.payment_succeeded')
                        AND CASE WHEN se.payload->>'amount_paid' ~ '^[0-9]+([.][0-9]+)?$'
                             THEN (se.payload->>'amount_paid')::numeric ELSE 0 END > 0)) AS ja_pagou,
           COALESCE(
             b.current_period_end AT TIME ZONE 'UTC',
             b.subscription_current_period_end AT TIME ZONE 'UTC'
           ) AS fim_do_periodo,
           b.provider, b.payment_method,
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
};
