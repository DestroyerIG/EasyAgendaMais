import { prisma } from '../config/prisma.js';

export const refreshTokenRepository = {
  async saveRefreshToken({
    userId,
    tokenHash,
    expiresAt,
  }: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });
  },

  async findValidRefreshToken(tokenHash: string): Promise<Record<string, unknown> | null> {
    const result = await prisma.refreshToken.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
        user: {
          blocked: false,
          emailVerified: true,
          business: {
            active: true,
          },
        },
      },
      include: {
        user: {
          include: {
            business: true,
          },
        },
      },
    });

    if (!result) {
      return null;
    }

    return {
      id: result.id,
      user_id: result.userId,
      email: result.user.email,
      role: result.user.role,
      email_verified: result.user.emailVerified,
      business_id: result.user.business.id,
      plan: result.user.business.plan,
      business_name: result.user.business.name,
      subscription_status: result.user.business.subscriptionStatus,
      subscription_current_period_end: result.user.business.subscriptionCurrentPeriodEnd,
    };
  },

  async revokeUserRefreshTokens(userId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  },

  async revokeRefreshTokenById(tokenId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: {
        id: tokenId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  },

  async revokeRefreshTokenByHash(tokenHash: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  },
};
