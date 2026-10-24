import { professionalRepository } from '../repositories/professionalRepository.js';
import { NotFoundError, PlanLimitError, ValidationError } from '../utils/errors.js';
import { getBusinessScheduleSettings } from './scheduleSettingsService.js';
import { prisma } from '../config/prisma.js';
import { normalizePlan } from '../config/planPermissions.js';
import { PLAN_ORDER, professionalLimit } from '../config/planCatalog.js';
import { limiteProfissionaisEfetivo } from '../modules/billing/planChange.rules.js';

type Plan = 'basico' | 'profissional' | 'premium';

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
    const negocio = await prisma.business.findUnique({
      where: { id: businessId },
      select: { planoAgendado: true },
    });
    const planoAtual = normalizePlan(plan) as Plan;
    const planoAgendado = negocio?.planoAgendado ? (normalizePlan(negocio.planoAgendado) as Plan) : null;
    const limit = limiteProfissionaisEfetivo(planoAtual, planoAgendado);

    if (currentProfessionals >= limit) {
      if (planoAgendado && professionalLimit(planoAtual) > currentProfessionals) {
        throw new ValidationError(
          'Com a mudança de plano agendada, não dá para cadastrar mais profissionais. Cancele a mudança em Plano e cobrança.'
        );
      }
      throw new PlanLimitError(
        PLAN_ORDER.find((id) => professionalLimit(id) > currentProfessionals) || 'premium'
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
