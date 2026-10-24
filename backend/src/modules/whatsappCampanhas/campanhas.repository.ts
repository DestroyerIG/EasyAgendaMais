import type { Prisma, WhatsappCampanha } from '@prisma/client';
import { prisma } from '../../config/prisma.js';

export type CampanhaRow = WhatsappCampanha;

/** Campos editáveis de uma campanha. */
export interface DadosCampanha {
  nome: string; segmento: string; professionalId: string | null; serviceId: string | null;
  texto: string; inicioEm: Date; cadencia: number;
}

const LIMITE_LISTA = 50;

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

  /** Mais novas primeiro. */
  listar(businessId: string): Promise<CampanhaRow[]> {
    return prisma.whatsappCampanha.findMany({ where: { businessId }, orderBy: { createdAt: 'desc' }, take: LIMITE_LISTA });
  },

  buscar(businessId: string, id: string): Promise<CampanhaRow | null> {
    return prisma.whatsappCampanha.findFirst({ where: { id, businessId } });
  },

  criar(data: DadosCampanha & { businessId: string; createdBy: string | null; status: 'rascunho' }): Promise<CampanhaRow> {
    return prisma.whatsappCampanha.create({ data });
  },

  /** Só altera se ainda for rascunho; null se não for (ou não existir). */
  async atualizarRascunho(businessId: string, id: string, data: DadosCampanha): Promise<CampanhaRow | null> {
    const r = await prisma.whatsappCampanha.updateMany({ where: { id, businessId, status: 'rascunho' }, data });
    return r.count === 1 ? this.buscar(businessId, id) : null;
  },

  /** rascunho -> agendada; 0 se outra requisição agendou antes. */
  async marcarAgendada(businessId: string, id: string): Promise<number> {
    const r = await prisma.whatsappCampanha.updateMany({ where: { id, businessId, status: 'rascunho' }, data: { status: 'agendada' } });
    return r.count;
  },

  async voltarRascunho(businessId: string, id: string): Promise<void> {
    await prisma.whatsappCampanha.updateMany({ where: { id, businessId, status: 'agendada' }, data: { status: 'rascunho', total: 0 } });
  },

  async gravarTotal(businessId: string, id: string, total: number): Promise<void> {
    await prisma.whatsappCampanha.updateMany({ where: { id, businessId }, data: { total } });
  },

  /** agendada -> cancelada; 0 se não estava agendada. */
  async marcarCancelada(businessId: string, id: string, db: Prisma.TransactionClient = prisma): Promise<number> {
    const r = await db.whatsappCampanha.updateMany({ where: { id, businessId, status: 'agendada' }, data: { status: 'cancelada' } });
    return r.count;
  },
};
