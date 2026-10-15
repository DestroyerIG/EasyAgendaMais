import { prisma } from '../../config/prisma.js';
import type { TagDto, TagListDto, CreateTagInput, UpdateTagInput } from './tags.types.js';

const sel = { id: true, name: true, color: true } as const;

export const tagsRepository = {
  async list(businessId: string): Promise<TagListDto[]> {
    const rows = await prisma.tag.findMany({
      where: { businessId }, orderBy: { name: 'asc' },
      select: { ...sel, _count: { select: { clients: true } } },
    });
    return rows.map((r) => ({ id: r.id, name: r.name, color: r.color, clientes: r._count.clients }));
  },
  create(businessId: string, data: CreateTagInput): Promise<TagDto> {
    return prisma.tag.create({ data: { businessId, name: data.name, color: data.color }, select: sel });
  },
  async update(id: string, businessId: string, data: UpdateTagInput): Promise<TagDto | null> {
    const r = await prisma.tag.updateMany({ where: { id, businessId }, data });
    if (r.count === 0) return null;
    return prisma.tag.findFirst({ where: { id, businessId }, select: sel });
  },
  async delete(id: string, businessId: string): Promise<boolean> {
    const r = await prisma.tag.deleteMany({ where: { id, businessId } });
    return r.count > 0;
  },
  async clientExists(clientId: string, businessId: string): Promise<boolean> {
    return (await prisma.client.count({ where: { id: clientId, businessId } })) > 0;
  },
  countOwned(businessId: string, tagIds: string[]): Promise<number> {
    return prisma.tag.count({ where: { businessId, id: { in: tagIds } } });
  },
  setClientTags(businessId: string, clientId: string, tagIds: string[]): Promise<TagDto[]> {
    return prisma.$transaction(async (tx) => {
      await tx.clientTag.deleteMany({ where: { clientId } });
      if (tagIds.length) await tx.clientTag.createMany({ data: tagIds.map((tagId) => ({ clientId, tagId })) });
      return tx.tag.findMany({ where: { businessId, clients: { some: { clientId } } }, orderBy: { name: 'asc' }, select: sel });
    });
  },
};
