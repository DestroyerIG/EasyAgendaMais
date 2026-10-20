import { prisma } from '../../config/prisma.js';

export const retornoRepository = {
  async negocio(businessId: string): Promise<{ nome: string; slug: string | null; whatsapp: string | null }> {
    const b = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true, slug: true, whatsapp: true } });
    return { nome: b?.name ?? '', slug: b?.slug ?? null, whatsapp: b?.whatsapp ?? null };
  },
};
