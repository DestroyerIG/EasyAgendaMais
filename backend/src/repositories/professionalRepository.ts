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
  available?: boolean;
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

  /** Agendamentos ainda por vir (não cancelados, concluídos nem faltas), por profissional. */
  async countFuturosPorProfissional(businessId: string, aPartirDe: string, professionalId?: string): Promise<Map<string, number>> {
    const rows = await prisma.appointment.groupBy({
      by: ['professionalId'],
      where: {
        businessId,
        ...(professionalId && { professionalId }),
        date: { gte: new Date(aPartirDe) },
        status: { notIn: ['cancelado', 'concluido', 'faltou'] },
      },
      _count: { _all: true },
    });
    return new Map(rows.map((r) => [r.professionalId, r._count._all]));
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
        ...(data.available !== undefined && { available: data.available }),
      },
    });
    if (result.count === 0) return null;
    return prisma.professional.findFirst({ where: { id } });
  },

  /** Liga/desliga a agenda. Só mexe em quem não foi excluída. */
  async setAvailable(id: string, businessId: string, available: boolean) {
    const result = await prisma.professional.updateMany({
      where: { id, businessId, active: true },
      data: { available },
    });
    return result.count > 0 ? { id, available } : null;
  },

  async softDelete(id: string, businessId: string) {
    const result = await prisma.professional.updateMany({
      where: { id, businessId, active: true },
      data: { active: false },
    });
    return result.count > 0 ? { id } : null;
  },
};
