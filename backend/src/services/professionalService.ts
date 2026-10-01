import { professionalRepository } from '../repositories/professionalRepository.js';
import { NotFoundError, PlanLimitError } from '../utils/errors.js';

type Plan = 'basico' | 'profissional' | 'premium';

const PROFESSIONAL_LIMITS: Record<Plan, number> = {
  basico: 1,
  profissional: 5,
  premium: 999,
};

interface ProfessionalData {
  name: string;
  photo?: string | null;
}

export const professionalService = {
  async getProfessionals(businessId: string) {
    return professionalRepository.findAllActive(businessId);
  },

  async createProfessional(businessId: string, plan: string, data: ProfessionalData) {
    const currentProfessionals = await professionalRepository.countActive(businessId);
    const limit = PROFESSIONAL_LIMITS[plan as Plan] ?? 1;

    if (currentProfessionals >= limit) {
      throw new PlanLimitError(
        Object.entries(PROFESSIONAL_LIMITS).find(([, v]) => v > currentProfessionals)?.[0] || 'premium'
      );
    }

    return (professionalRepository as unknown as {
      create(data: { business_id: string; name: string; photo: string | null }): Promise<unknown>;
    }).create({
      business_id: businessId,
      name: data.name,
      photo: data.photo ?? null,
    });
  },

  async updateProfessional(id: string, businessId: string, data: ProfessionalData) {
    const result = await (professionalRepository as unknown as {
      update(id: string, businessId: string, data: { name: string; photo?: string | null }): Promise<unknown>;
    }).update(id, businessId, {
      name: data.name,
      photo: data.photo,
    });
    if (!result) throw new NotFoundError('Profissional');
    return result;
  },

  async deleteProfessional(id: string, businessId: string): Promise<void> {
    const result = await (professionalRepository as unknown as {
      softDelete(id: string, businessId: string): Promise<unknown>;
    }).softDelete(id, businessId);
    if (!result) throw new NotFoundError('Profissional');
  },
};
