import { prisma } from '../../config/prisma.js';
import type { PublicPageSettings, UpdatePublicPageInput } from './businessPublicPage.types.js';

// Decimal do Prisma vira number para a API.
const comPercentualNumerico = <T extends { sinalPadraoPct: { toString(): string } | null }>(b: T) =>
  ({ ...b, sinalPadraoPct: b.sinalPadraoPct === null ? null : Number(b.sinalPadraoPct) });

export const businessPublicPageRepository = {
  async findByBusinessId(businessId: string): Promise<PublicPageSettings | null> {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: {
        slug: true, pixKey: true, pixKeyType: true, logoUrl: true, brandColor: true, galleryPhotos: true, address: true,
        coverUrl: true, description: true, comodidades: true, mostrarNota: true, botCobraSinal: true, sinalPadraoPct: true,
      },
    });
    return business && comPercentualNumerico(business);
  },

  async slugExists(slug: string, excludeBusinessId?: string): Promise<boolean> {
    const existing = await prisma.business.findFirst({
      where: { slug, ...(excludeBusinessId ? { NOT: { id: excludeBusinessId } } : {}) },
      select: { id: true },
    });
    return existing !== null;
  },

  async update(businessId: string, data: UpdatePublicPageInput): Promise<PublicPageSettings> {
    const atualizado = await prisma.business.update({
      where: { id: businessId },
      data,
      select: {
        slug: true, pixKey: true, pixKeyType: true, logoUrl: true, brandColor: true, galleryPhotos: true, address: true,
        coverUrl: true, description: true, comodidades: true, mostrarNota: true, botCobraSinal: true, sinalPadraoPct: true,
      },
    });
    return comPercentualNumerico(atualizado);
  },
};
