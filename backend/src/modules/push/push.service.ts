import webpush from 'web-push';
import { prisma } from '../../config/prisma.js';
import logger from '../../utils/logger.js';

// Web Push (fase 5): a profissional recebe os eventos dela; a equipe do painel recebe o sino.
// Sem as chaves VAPID nada é enviado e nada é consultado.

export interface PushPayload {
  titulo: string;
  corpo?: string | null;
  /** Caminho aberto ao tocar na notificação. */
  link?: string | null;
  /** Mesma tag substitui a notificação anterior no aparelho. */
  tag?: string;
}

export interface InscricaoInput { endpoint: string; keys: { p256dh: string; auth: string } }

let configuradoCom: string | null = null;

function chaves() {
  const publica = process.env.VAPID_PUBLIC_KEY ?? '';
  const privada = process.env.VAPID_PRIVATE_KEY ?? '';
  const assunto = process.env.VAPID_SUBJECT ?? '';
  return publica && privada && assunto ? { publica, privada, assunto } : null;
}

function prontoParaEnviar(): boolean {
  const c = chaves();
  if (!c) return false;
  const assinatura = `${c.publica}|${c.assunto}`;
  if (configuradoCom !== assinatura) {
    webpush.setVapidDetails(c.assunto, c.publica, c.privada);
    configuradoCom = assinatura;
  }
  return true;
}

const statusDoErro = (e: unknown): number | undefined => (e as { statusCode?: number } | null)?.statusCode;

async function enviar(userIds: string[], payload: PushPayload): Promise<number> {
  if (userIds.length === 0 || !prontoParaEnviar()) return 0;
  const inscricoes = await prisma.pushInscricao.findMany({
    where: { userId: { in: userIds } }, select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  const corpo = JSON.stringify({ titulo: payload.titulo, corpo: payload.corpo ?? '', link: payload.link ?? '/', tag: payload.tag });
  let enviados = 0;
  await Promise.all(inscricoes.map(async (i) => {
    try {
      await webpush.sendNotification({ endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } }, corpo, { TTL: 60 * 60 });
      enviados += 1;
    } catch (e) {
      const status = statusDoErro(e);
      // 404/410: o aparelho cancelou a inscrição; não adianta tentar de novo.
      if (status === 404 || status === 410) {
        await prisma.pushInscricao.delete({ where: { id: i.id } }).catch(() => undefined);
      } else {
        logger.warn({ err: e, status }, 'Push não entregue');
        await prisma.pushInscricao.update({ where: { id: i.id }, data: { ultimoErroEm: new Date() } }).catch(() => undefined);
      }
    }
  }));
  return enviados;
}

/** Nunca lança: push é aviso, não pode derrubar o fluxo que o disparou. */
const seguro = (fn: () => Promise<number>) => fn().catch((e) => { logger.warn({ err: e }, 'Falha ao enviar push'); return 0; });

export const pushService = {
  configurado: () => chaves() !== null,
  chavePublica: () => chaves()?.publica ?? null,

  async inscrever(userId: string, i: InscricaoInput, userAgent: string | null): Promise<void> {
    // O mesmo aparelho pode trocar de dona (logout e outro login): a inscrição passa para quem entrou.
    await prisma.pushInscricao.upsert({
      where: { endpoint: i.endpoint },
      create: { userId, endpoint: i.endpoint, p256dh: i.keys.p256dh, auth: i.keys.auth, userAgent: userAgent?.slice(0, 255) ?? null },
      update: { userId, p256dh: i.keys.p256dh, auth: i.keys.auth, userAgent: userAgent?.slice(0, 255) ?? null, ultimoErroEm: null },
    });
  },

  async remover(userId: string, endpoint: string): Promise<void> {
    await prisma.pushInscricao.deleteMany({ where: { userId, endpoint } });
  },

  /** Dona e recepção do negócio (quem vê o sino). */
  paraEquipe(businessId: string, payload: PushPayload): Promise<number> {
    return seguro(async () => {
      if (!pushService.configurado()) return 0;
      const usuarios = await prisma.user.findMany({
        where: { businessId, blocked: false, role: { in: ['tenant_admin', 'employee'] } }, select: { id: true },
      });
      return enviar(usuarios.map((u) => u.id), payload);
    });
  },

  /** O login da profissional (se ela tiver acesso ao app). */
  paraProfissional(businessId: string, professionalId: string, payload: PushPayload): Promise<number> {
    return seguro(async () => {
      if (!pushService.configurado()) return 0;
      const u = await prisma.user.findFirst({ where: { businessId, professionalId, blocked: false }, select: { id: true } });
      return u ? enviar([u.id], payload) : 0;
    });
  },
};
