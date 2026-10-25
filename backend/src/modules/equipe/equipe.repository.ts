import { prisma } from '../../config/prisma.js';

// Acesso das profissionais ao app: convites e o login ligado ao cadastro.

const ULTIMO_CONVITE = {
  orderBy: { criadoEm: 'desc' as const }, take: 1,
  select: { id: true, email: true, criadoEm: true, expiraEm: true, aceitoEm: true, revogadoEm: true },
};
const USUARIO = { select: { id: true, email: true, blocked: true, createdAt: true } };

export const equipeRepository = {
  profissional(businessId: string, professionalId: string) {
    return prisma.professional.findFirst({
      where: { id: professionalId, businessId },
      select: { id: true, name: true, active: true, usuario: USUARIO, convites: ULTIMO_CONVITE },
    });
  },

  acessos(businessId: string) {
    return prisma.professional.findMany({
      where: { businessId },
      select: { id: true, usuario: USUARIO, convites: ULTIMO_CONVITE },
    });
  },

  /** Qualquer usuário com este e-mail (o e-mail é único no sistema todo). */
  usuarioDoEmail(email: string) {
    return prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true, professionalId: true } });
  },

  negocio(businessId: string) {
    return prisma.business.findUnique({ where: { id: businessId }, select: { name: true, plan: true, subscriptionStatus: true } });
  },

  /** Um convite aberto por profissional: o novo revoga os anteriores. */
  async criarConvite(d: { businessId: string; professionalId: string; email: string; tokenHash: string; expiraEm: Date; criadoPor: string }) {
    return prisma.$transaction(async (tx) => {
      await tx.profissionalConvite.updateMany({
        where: { professionalId: d.professionalId, aceitoEm: null, revogadoEm: null }, data: { revogadoEm: new Date() },
      });
      return tx.profissionalConvite.create({ data: d, select: { id: true, email: true, criadoEm: true } });
    });
  },

  revogarAbertos(professionalId: string) {
    return prisma.profissionalConvite.updateMany({
      where: { professionalId, aceitoEm: null, revogadoEm: null }, data: { revogadoEm: new Date() },
    });
  },

  conviteDoToken(tokenHash: string) {
    return prisma.profissionalConvite.findUnique({
      where: { tokenHash },
      select: {
        id: true, businessId: true, professionalId: true, email: true, expiraEm: true, aceitoEm: true, revogadoEm: true,
        professional: { select: { name: true, active: true, usuario: { select: { id: true } } } },
        business: { select: { name: true, plan: true, subscriptionStatus: true } },
      },
    });
  },

  /**
   * Marca o convite como usado e cria o login, numa transação. Devolve false se outro aceite
   * chegou antes (o compare-and-set no convite impede duas contas para o mesmo convite).
   */
  async aceitar(d: { conviteId: string; businessId: string; professionalId: string; email: string; supabaseUserId: string; passwordHash: string }) {
    return prisma.$transaction(async (tx) => {
      const marcado = await tx.profissionalConvite.updateMany({
        where: { id: d.conviteId, aceitoEm: null, revogadoEm: null, expiraEm: { gt: new Date() } },
        data: { aceitoEm: new Date() },
      });
      if (marcado.count !== 1) return false;
      await tx.user.create({
        data: {
          businessId: d.businessId, email: d.email, passwordHash: d.passwordHash, role: 'professional',
          professionalId: d.professionalId, emailVerified: true, emailVerifiedAt: new Date(),
          supabaseUserId: d.supabaseUserId, authProvider: 'supabase',
        },
      });
      return true;
    });
  },

  async configuracao(businessId: string): Promise<{ profissionalCobra: boolean }> {
    const s = await prisma.businessSettings.findUnique({ where: { businessId }, select: { profissionalCobra: true } });
    return { profissionalCobra: s?.profissionalCobra ?? false };
  },

  async salvarConfiguracao(businessId: string, profissionalCobra: boolean): Promise<{ profissionalCobra: boolean }> {
    const s = await prisma.businessSettings.upsert({
      where: { businessId }, create: { businessId, profissionalCobra }, update: { profissionalCobra }, select: { profissionalCobra: true },
    });
    return { profissionalCobra: s.profissionalCobra };
  },

  /** Bloquear também derruba as sessões abertas (refresh tokens). */
  async definirBloqueio(userId: string, bloqueado: boolean) {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { blocked: bloqueado, blockedAt: bloqueado ? new Date() : null, blockedReason: bloqueado ? 'Acesso ao app removido pela dona' : null },
      }),
      ...(bloqueado ? [prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })] : []),
    ]);
  },
};
