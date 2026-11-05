import { prisma } from '../config/prisma.js';

export const serviceRepository = {
  async findAllActive(businessId: string) {
    return prisma.service.findMany({
      where: { businessId, active: true },
      orderBy: { name: 'asc' },
    });
  },

  async findPrice(serviceId: string) {
    return prisma.service.findFirst({
      where: { id: serviceId },
      select: { price: true },
    });
  },

  async findDuration(serviceId: string, businessId: string) {
    return prisma.service.findFirst({
      where: { id: serviceId, businessId, active: true },
      select: { durationMinutes: true },
    });
  },

  async create(data: { business_id: string; name: string; price: number; duration_minutes: number; depositPercentage?: number; description?: string }) {
    return prisma.service.create({
      data: {
        businessId: data.business_id,
        name: data.name,
        price: data.price,
        durationMinutes: data.duration_minutes,
        depositPercentage: data.depositPercentage ?? null,
        description: data.description || null,
      },
    });
  },

  async update(id: string, businessId: string, data: { name: string; price: number; duration_minutes: number; depositPercentage?: number; description?: string }) {
    const result = await prisma.service.updateMany({
      where: { id, businessId },
      data: {
        name: data.name,
        price: data.price,
        durationMinutes: data.duration_minutes,
        ...(data.depositPercentage !== undefined && { depositPercentage: data.depositPercentage }),
        ...(data.description !== undefined && { description: data.description || null }),
      },
    });
    if (result.count === 0) return null;
    return prisma.service.findFirst({ where: { id } });
  },

  async softDelete(id: string, businessId: string) {
    const result = await prisma.service.updateMany({
      where: { id, businessId, active: true },
      data: { active: false },
    });
    return result.count > 0 ? { id } : null;
  },
};
