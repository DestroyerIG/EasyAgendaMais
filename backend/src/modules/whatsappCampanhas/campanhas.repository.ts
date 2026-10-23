import { prisma } from '../../config/prisma.js';

export const campanhasRepository = {
  /** Profissionais e serviços ativos, por nome, para os filtros do público. */
  async opcoes(businessId: string): Promise<{ profissionais: Array<{ id: string; nome: string }>; servicos: Array<{ id: string; nome: string }> }> {
    const [profs, servs] = await Promise.all([
      prisma.professional.findMany({ where: { businessId, active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      prisma.service.findMany({ where: { businessId, active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    return {
      profissionais: profs.map((p) => ({ id: p.id, nome: p.name })),
      servicos: servs.map((s) => ({ id: s.id, nome: s.name })),
    };
  },
};
