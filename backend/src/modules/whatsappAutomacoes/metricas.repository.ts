import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { TEXTO_REAGENDAR } from './automacoes.rules.js';

/** Origens que contam como "trouxe a cliente de volta" (envio nos 7 dias antes de agendar). */
const ORIGENS_RECEITA = ['retorno', 'aniversario', 'campanha'];
/** Mensagens automáticas que esperam resposta da cliente. */
const ORIGENS_RESPOSTA = ['confirmacao', 'avaliacao', 'retorno', 'aniversario', 'lista_espera'];
/** Status de quem já pagou o sinal (a reserva saiu de `aguardando_pagamento` sem cancelar). */
const STATUS_PAGOS = ['confirmado', 'em_atendimento', 'concluido', 'faltou'];

/**
 * Mesma regra do canonicalizePhone em SQL: só dígitos, tira o 55 de 13+ dígitos e o 9 do celular.
 * '[^0-9]' e não '\D' (ver inbox.repository.ts).
 */
const canonico = (coluna: string): Prisma.Sql => {
  const d = `regexp_replace(${coluna}, '[^0-9]', '', 'g')`;
  const x = `(CASE WHEN length(${d}) >= 13 AND left(${d}, 2) = '55' THEN substr(${d}, 3) ELSE ${d} END)`;
  return Prisma.raw(`(CASE WHEN ${x} ~ '^[0-9]{2}9[0-9]{8}$' THEN substr(${x}, 1, 2) || substr(${x}, 4) ELSE ${x} END)`);
};

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

export const metricasRepository = {
  /**
   * Preço dos agendamentos criados no período (não cancelados nem esperando Pix) de clientes que
   * receberam retorno/aniversário/campanha (fila) ou mensagem `lista_espera` (envio direto, pela phone_key)
   * nos 7 dias anteriores.
   * Cada agendamento conta uma vez; se houve `retorno`, entra na parte do retorno.
   */
  async receitaAutomacoes(businessId: string, inicio: Date, fim: Date): Promise<{ retorno: number; outros: number }> {
    const [r] = await prisma.$queryRaw<Array<{ retorno: unknown; outros: unknown }>>`
      SELECT
        COALESCE(SUM(s.price) FILTER (WHERE t.retorno), 0) AS retorno,
        COALESCE(SUM(s.price) FILTER (WHERE NOT t.retorno AND t.outros), 0) AS outros
      FROM appointments a
      JOIN services s ON s.id = a.service_id
      JOIN clients c ON c.id = a.client_id
      -- created_at é timestamp sem fuso gravado em UTC; enviado_em é timestamptz.
      CROSS JOIN LATERAL (SELECT a.created_at AT TIME ZONE 'UTC' AS criada) ac
      CROSS JOIN LATERAL (SELECT
        EXISTS (SELECT 1 FROM whatsapp_envios e
                 WHERE e.business_id = a.business_id AND e.client_id = a.client_id AND e.status = 'enviado'
                   AND e.origin = 'retorno'
                   AND e.enviado_em >= ac.criada - interval '7 days' AND e.enviado_em <= ac.criada) AS retorno,
        (EXISTS (SELECT 1 FROM whatsapp_envios e
                  WHERE e.business_id = a.business_id AND e.client_id = a.client_id AND e.status = 'enviado'
                    AND e.origin IN (${Prisma.join(ORIGENS_RECEITA)})
                    AND e.enviado_em >= ac.criada - interval '7 days' AND e.enviado_em <= ac.criada)
         OR EXISTS (SELECT 1 FROM whatsapp_messages m
                     WHERE m.business_id = a.business_id AND m.direction = 'out' AND m.origin = 'lista_espera'
                       AND m.status <> 'falhou' AND m.phone_key = ${canonico('c.phone')}
                       AND m.created_at >= ac.criada - interval '7 days' AND m.created_at <= ac.criada)) AS outros
      ) t
      WHERE a.business_id = ${businessId}::uuid AND a.created_at >= ${inicio} AND a.created_at < ${fim}
        AND a.status NOT IN ('cancelado', 'aguardando_pagamento')`;
    return { retorno: num(r?.retorno), outros: num(r?.outros) };
  },

  /** Sinais pagos de reservas criadas no período cuja cliente recebeu a mensagem `sinal_pix`. */
  async sinaisRecebidos(businessId: string, inicio: Date, fim: Date): Promise<number> {
    const [r] = await prisma.$queryRaw<Array<{ total: unknown }>>`
      SELECT COALESCE(SUM(a.deposit_amount), 0) AS total
      FROM appointments a
      JOIN clients c ON c.id = a.client_id
      WHERE a.business_id = ${businessId}::uuid AND a.created_at >= ${inicio} AND a.created_at < ${fim}
        AND a.deposit_amount > 0 AND a.status IN (${Prisma.join(STATUS_PAGOS)})
        AND EXISTS (SELECT 1 FROM whatsapp_messages m
                     WHERE m.business_id = a.business_id AND m.direction = 'out' AND m.origin = 'sinal_pix'
                       AND m.phone_key = ${canonico('c.phone')}
                       AND m.created_at >= (a.created_at AT TIME ZONE 'UTC') - interval '1 hour' AND m.created_at <= (a.created_at AT TIME ZONE 'UTC') + interval '1 hour')`;
    return num(r?.total);
  },

  confirmadosPeloCliente: (businessId: string, inicio: Date, fim: Date) =>
    prisma.appointment.count({ where: { businessId, clientConfirmedAt: { gte: inicio, lt: fim } } }),

  pedidosDeReagendar: (businessId: string, inicio: Date, fim: Date) =>
    prisma.whatsappMessage.count({ where: {
      businessId, direction: 'out', origin: 'painel_evento', body: TEXTO_REAGENDAR, createdAt: { gte: inicio, lt: fim } } }),

  /** Mensagens automáticas do período e quantas tiveram resposta na mesma conversa em até 24h. */
  async respostas(businessId: string, inicio: Date, fim: Date): Promise<{ total: number; respondidas: number; mediaMin: number | null }> {
    const [r] = await prisma.$queryRaw<Array<{ total: unknown; respondidas: unknown; media: unknown }>>`
      SELECT count(*)::int AS total, count(r.em)::int AS respondidas,
             avg(extract(epoch FROM (r.em - m.created_at)) / 60) AS media
      FROM whatsapp_messages m
      LEFT JOIN LATERAL (SELECT min(i.created_at) AS em FROM whatsapp_messages i
                          WHERE i.conversation_id = m.conversation_id AND i.direction = 'in'
                            AND i.created_at > m.created_at AND i.created_at <= m.created_at + interval '24 hours') r ON true
      WHERE m.business_id = ${businessId}::uuid AND m.direction = 'out' AND m.status <> 'falhou'
        AND m.origin IN (${Prisma.join(ORIGENS_RESPOSTA)})
        AND m.created_at >= ${inicio} AND m.created_at < ${fim}`;
    return { total: num(r?.total), respondidas: num(r?.respondidas), mediaMin: r?.media === null || r?.media === undefined ? null : Number(r.media) };
  },

  vagasPreenchidas: (businessId: string, inicio: Date, fim: Date) =>
    prisma.waitlistEntry.count({ where: { businessId, status: 'agendada', offeredAt: { gte: inicio, lt: fim } } }),

  async lembretes(businessId: string, inicio: Date, fim: Date): Promise<{ enviados: number; lidos: number }> {
    const g = await prisma.whatsappMessage.groupBy({
      by: ['status'], where: { businessId, direction: 'out', origin: 'lembrete', createdAt: { gte: inicio, lt: fim } },
      _count: { _all: true } });
    let enviados = 0; let lidos = 0;
    for (const x of g) {
      if (x.status === 'falhou') continue;
      enviados += x._count._all;
      if (x.status === 'lida') lidos += x._count._all;
    }
    return { enviados, lidos };
  },

  /** Clientes com `aniversario` enviado no período e, dessas, as que agendaram em até 7 dias. */
  async aniversario(businessId: string, inicio: Date, fim: Date): Promise<{ aniversariantes: number; agendamentos: number }> {
    const [r] = await prisma.$queryRaw<Array<{ aniversariantes: unknown; agendamentos: unknown }>>`
      SELECT count(DISTINCT e.client_id)::int AS aniversariantes,
             count(DISTINCT e.client_id) FILTER (WHERE EXISTS (
               SELECT 1 FROM appointments a
                WHERE a.business_id = e.business_id AND a.client_id = e.client_id AND a.status <> 'cancelado'
                  AND (a.created_at AT TIME ZONE 'UTC') >= e.enviado_em AND (a.created_at AT TIME ZONE 'UTC') <= e.enviado_em + interval '7 days'))::int AS agendamentos
      FROM whatsapp_envios e
      WHERE e.business_id = ${businessId}::uuid AND e.origin = 'aniversario' AND e.status = 'enviado'
        AND e.client_id IS NOT NULL AND e.enviado_em >= ${inicio} AND e.enviado_em < ${fim}`;
    return { aniversariantes: num(r?.aniversariantes), agendamentos: num(r?.agendamentos) };
  },

  async avaliacoes(businessId: string, inicio: Date, fim: Date): Promise<{ media: number | null; novas: number }> {
    const a = await prisma.whatsappRating.aggregate({
      where: { businessId, createdAt: { gte: inicio, lt: fim } }, _avg: { rating: true }, _count: { _all: true } });
    return { media: a._avg.rating ?? null, novas: a._count._all };
  },
};
