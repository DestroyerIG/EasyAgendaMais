import { prisma } from '../config/prisma.js';

interface ProfessionalWriteData {
  name?: string;
  photo?: string | null;
  breakStart?: string | null;
  breakEnd?: string | null;
  commissionServicePct?: number | null;
  commissionProductPct?: number | null;
  cnpj?: string | null;
  especialidade?: string | null;
}

const toTime = (hhmm: string | null) => (hhmm ? new Date(`1970-01-01T${hhmm}:00Z`) : null);

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

  async create(data: ProfessionalWriteData & { business_id: string; name: string; photo: string | null }) {
    return prisma.professional.create({
      data: {
        businessId: data.business_id,
        name: data.name,
        photo: data.photo,
        breakStart: toTime(data.breakStart ?? null),
        breakEnd: toTime(data.breakEnd ?? null),
        commissionServicePct: data.commissionServicePct ?? null,
        commissionProductPct: data.commissionProductPct ?? null,
        cnpj: data.cnpj ?? null,
        especialidade: data.especialidade ?? null,
      },
    });
  },

  async update(id: string, businessId: string, data: ProfessionalWriteData) {
    const result = await prisma.professional.updateMany({
      where: { id, businessId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.photo !== undefined && { photo: data.photo }),
        ...(data.breakStart !== undefined && { breakStart: toTime(data.breakStart) }),
        ...(data.breakEnd !== undefined && { breakEnd: toTime(data.breakEnd) }),
        ...(data.commissionServicePct !== undefined && { commissionServicePct: data.commissionServicePct }),
        ...(data.commissionProductPct !== undefined && { commissionProductPct: data.commissionProductPct }),
        ...(data.cnpj !== undefined && { cnpj: data.cnpj }),
        ...(data.especialidade !== undefined && { especialidade: data.especialidade }),
      },
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
