import { professionalRepository } from '../repositories/professionalRepository.js';
import { NotFoundError, PlanLimitError, ValidationError } from '../utils/errors.js';
import { getBusinessScheduleSettings } from './scheduleSettingsService.js';

type Plan = 'basico' | 'profissional' | 'premium';

const PROFESSIONAL_LIMITS: Record<Plan, number> = {
  basico: 1,
  profissional: 5,
  premium: 999,
};

interface ProfessionalData {
  name: string;
  photo?: string | null;
  breakStart?: string | null;
  breakEnd?: string | null;
  commissionServicePct?: number | null;
  commissionProductPct?: number | null;
}

const hhmm = (t: Date | null) => (t ? t.toISOString().substring(11, 16) : null);
const pct = (v: unknown) => (v === null || v === undefined ? null : Number(v));

async function validarIntervaloNoExpediente(businessId: string, data: ProfessionalData) {
  if (!data.breakStart && !data.breakEnd) return;
  const { openingTime, closingTime } = await getBusinessScheduleSettings(businessId);
  if (
    (data.breakStart && data.breakStart < openingTime) ||
    (data.breakEnd && data.breakEnd > closingTime)
  ) {
    throw new ValidationError('O intervalo precisa ficar dentro do horário de funcionamento');
  }
}

export const professionalService = {
  async getProfessionals(businessId: string) {
    return (await professionalRepository.findAllActive(businessId)).map((p) => ({
      ...p,
      breakStart: hhmm(p.breakStart),
      breakEnd: hhmm(p.breakEnd),
      commissionServicePct: pct(p.commissionServicePct),
      commissionProductPct: pct(p.commissionProductPct),
    }));
  },

  async createProfessional(businessId: string, plan: string, data: ProfessionalData) {
    const currentProfessionals = await professionalRepository.countActive(businessId);
    const limit = PROFESSIONAL_LIMITS[plan as Plan] ?? 1;

    if (currentProfessionals >= limit) {
      throw new PlanLimitError(
        Object.entries(PROFESSIONAL_LIMITS).find(([, v]) => v > currentProfessionals)?.[0] || 'premium'
      );
    }

    await validarIntervaloNoExpediente(businessId, data);

    return professionalRepository.create({
      business_id: businessId,
      name: data.name,
      photo: data.photo ?? null,
      breakStart: data.breakStart,
      breakEnd: data.breakEnd,
      commissionServicePct: data.commissionServicePct,
      commissionProductPct: data.commissionProductPct,
    });
  },

  async updateProfessional(id: string, businessId: string, data: ProfessionalData) {
    await validarIntervaloNoExpediente(businessId, data);

    const result = await professionalRepository.update(id, businessId, data);
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
