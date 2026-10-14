import { z } from 'zod';
import { prisma } from '../../config/prisma.js';

export const CommissionSettingsSchema = z.object({
  serviceCommissionPct: z.number().min(0).max(100),
  productCommissionPct: z.number().min(0).max(100),
});
export type CommissionSettings = z.infer<typeof CommissionSettingsSchema>;

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export const commissionSettings = {
  async get(businessId: string): Promise<CommissionSettings> {
    const s = await prisma.businessSettings.findUnique({
      where: { businessId },
      select: { commissionServicePct: true, commissionProductPct: true },
    });
    return { serviceCommissionPct: num(s?.commissionServicePct), productCommissionPct: num(s?.commissionProductPct) };
  },

  async update(businessId: string, data: CommissionSettings): Promise<CommissionSettings> {
    const s = await prisma.businessSettings.upsert({
      where: { businessId },
      create: { businessId, commissionServicePct: data.serviceCommissionPct, commissionProductPct: data.productCommissionPct },
      update: { commissionServicePct: data.serviceCommissionPct, commissionProductPct: data.productCommissionPct },
      select: { commissionServicePct: true, commissionProductPct: true },
    });
    return { serviceCommissionPct: num(s.commissionServicePct), productCommissionPct: num(s.commissionProductPct) };
  },
};

export function resolveCommission(
  professional: { commissionServicePct: unknown; commissionProductPct: unknown },
  negocio: CommissionSettings,
): { servicePct: number; productPct: number; origem: 'profissional' | 'negocio' } {
  const temServ = professional.commissionServicePct !== null && professional.commissionServicePct !== undefined;
  const temProd = professional.commissionProductPct !== null && professional.commissionProductPct !== undefined;
  return {
    servicePct: temServ ? Number(professional.commissionServicePct) : negocio.serviceCommissionPct,
    productPct: temProd ? Number(professional.commissionProductPct) : negocio.productCommissionPct,
    origem: temServ || temProd ? 'profissional' : 'negocio',
  };
}
