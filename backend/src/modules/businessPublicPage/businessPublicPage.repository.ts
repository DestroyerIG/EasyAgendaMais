import { prisma } from '../../config/prisma.js';
import type { PublicPageSettings, UpdatePublicPageInput } from './businessPublicPage.types.js';

export const businessPublicPageRepository = {
  async findByBusinessId(businessId: string): Promise<PublicPageSettings | null> {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { slug: true, pixKey: true, pixKeyType: true, logoUrl: true, brandColor: true },
    });
    return business;
  },

  async slugExists(slug: string, excludeBusinessId?: string): Promise<boolean> {
    const existing = await prisma.business.findFirst({
      where: { slug, ...(excludeBusinessId ? { NOT: { id: excludeBusinessId } } : {}) },
      select: { id: true },
    });
    return existing !== null;
  },

  async update(businessId: string, data: UpdatePublicPageInput): Promise<PublicPageSettings> {
    return prisma.business.update({
      where: { id: businessId },
      data,
      select: { slug: true, pixKey: true, pixKeyType: true, logoUrl: true, brandColor: true },
    });
  },
};
