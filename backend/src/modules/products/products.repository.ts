import { prisma } from '../../config/prisma.js';
import type { CreateProductInput, UpdateProductInput } from './products.types.js';

const SELECT = { id: true, name: true, description: true, price: true, active: true } as const;

export const productsRepository = {
  list(businessId: string) {
    return prisma.product.findMany({ where: { businessId, active: true }, select: SELECT, orderBy: { name: 'asc' } });
  },
  create(businessId: string, data: CreateProductInput) {
    return prisma.product.create({ data: { businessId, name: data.name, description: data.description ?? null, price: data.price }, select: SELECT });
  },
  async update(id: string, businessId: string, data: UpdateProductInput) {
    const r = await prisma.product.updateMany({
      where: { id, businessId, active: true },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.price !== undefined && { price: data.price }),
      },
    });
    if (r.count === 0) return null;
    return prisma.product.findFirst({ where: { id }, select: SELECT });
  },
  async deactivate(id: string, businessId: string) {
    const r = await prisma.product.updateMany({ where: { id, businessId, active: true }, data: { active: false } });
    return r.count > 0;
  },
  findActiveByIds(businessId: string, ids: string[]) {
    return prisma.product.findMany({ where: { businessId, active: true, id: { in: ids } }, select: { id: true, name: true, price: true } });
  },
};
