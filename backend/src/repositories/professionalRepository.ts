import { prisma } from '../config/prisma.js';

export const professionalRepository = {
  async findAllActive(businessId: string) {
    return prisma.professional.findMany({
      where: { businessId, active: true },
      orderBy: { name: 'asc' },
    });
  },

  async countActive(businessId: string): Promise<number> {
    return prisma.professional.count({ where: { businessId, active: true } });
  },

  async create(data: { business_id: string; name: string; photo: string | null }) {
    return prisma.professional.create({
      data: {
        businessId: data.business_id,
        name: data.name,
        photo: data.photo,
      },
    });
  },

  async update(id: string, businessId: string, data: { name: string; photo?: string | null }) {
    const result = await prisma.professional.updateMany({
      where: { id, businessId },
      data: { name: data.name, photo: data.photo },
    });
    if (result.count === 0) return null;
    return prisma.professional.findFirst({ where: { id } });
  },

  async softDelete(id: string, businessId: string) {
    const result = await prisma.professional.updateMany({
      where: { id, businessId, active: true },
      data: { active: false },
    });
    return result.count > 0 ? { id } : null;
  },
};
