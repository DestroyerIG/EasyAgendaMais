import type { WhatsappEnvio } from '@prisma/client';
import { prisma } from '../../config/prisma.js';

export type EnvioRow = WhatsappEnvio;

export const filaRepository = {
  naFilaDoCliente(businessId: string, clientId: string, origin: string): Promise<EnvioRow | null> {
    return prisma.whatsappEnvio.findFirst({ where: { businessId, clientId, origin, status: 'na_fila' } });
  },

  criar(data: {
    businessId: string; clientId: string | null; phone: string; phoneKey: string; body: string;
    origin: string; scheduledFor: Date; batchId: string | null;
  }): Promise<EnvioRow> {
    return prisma.whatsappEnvio.create({ data });
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
      where: { businessId, status: 'enviado', sentAt: { not: null } },
      orderBy: { sentAt: 'desc' },
      select: { sentAt: true, intervalAfterS: true },
    });
    return r?.sentAt ? { sentAt: r.sentAt, intervalAfterS: r.intervalAfterS ?? 0 } : null;
  },

  contarEnviadosDesde(businessId: string, desde: Date): Promise<number> {
    return prisma.whatsappEnvio.count({ where: { businessId, status: 'enviado', sentAt: { gte: desde } } });
  },

  proximoVencido(businessId: string, agora: Date): Promise<EnvioRow | null> {
    return prisma.whatsappEnvio.findFirst({
      where: { businessId, status: 'na_fila', scheduledFor: { lte: agora } },
      orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }],
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

  recentesPorCliente(businessId: string, origin: string, clientIds: string[]): Promise<EnvioRow[]> {
    if (!clientIds.length) return Promise.resolve([]);
    return prisma.whatsappEnvio.findMany({
      where: { businessId, origin, clientId: { in: clientIds } },
      orderBy: { createdAt: 'desc' },
    });
  },
};
