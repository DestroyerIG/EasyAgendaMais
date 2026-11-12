import { professionalRepository } from '../repositories/professionalRepository.js';
import { NotFoundError, PlanLimitError, ValidationError } from '../utils/errors.js';
import { getBusinessScheduleSettings } from './scheduleSettingsService.js';
import { prisma } from '../config/prisma.js';
import { normalizePlan } from '../config/planPermissions.js';
import { PLAN_ORDER, professionalLimit } from '../config/planCatalog.js';
import { todayInTimezone } from '../utils/businessDate.js';
import { limiteProfissionaisEfetivo } from '../modules/billing/planChange.rules.js';

type Plan = 'basico' | 'profissional' | 'premium';

interface ProfessionalData {
  name: string;
  photo?: string | null;
  breakStart?: string | null;
  breakEnd?: string | null;
  commissionServicePct?: number | null;
  commissionProductPct?: number | null;
  cnpj?: string | null;
  especialidade?: string | null;
  available?: boolean;
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

async function hojeDoNegocio(businessId: string): Promise<string> {
  const { timezone } = await getBusinessScheduleSettings(businessId);
  return todayInTimezone(timezone);
}

export const professionalService = {
  async getProfessionals(businessId: string) {
    const lista = await professionalRepository.findAllActive(businessId);
    const futuros = await professionalRepository.countFuturosPorProfissional(businessId, await hojeDoNegocio(businessId));
    return lista.map((p) => ({
      ...p,
      agendamentosFuturos: futuros.get(p.id) ?? 0,
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
      cnpj: data.cnpj,
      especialidade: data.especialidade,
    });
  },

  async updateProfessional(id: string, businessId: string, data: ProfessionalData) {
    await validarIntervaloNoExpediente(businessId, data);

    const result = await professionalRepository.update(id, businessId, data);
    if (!result) throw new NotFoundError('Profissional');
    return result;
  },

  /**
   * Liga ou desliga a agenda. Desligada, não entram agendamentos novos; os que já existem
   * continuam, e a resposta traz quantos são para a tela avisar.
   */
  async setAvailability(id: string, businessId: string, available: boolean) {
    const result = await professionalRepository.setAvailable(id, businessId, available);
    if (!result) throw new NotFoundError('Profissional');
    const futuros = await professionalRepository.countFuturosPorProfissional(businessId, await hojeDoNegocio(businessId), id);
    return { id, available, agendamentosFuturos: futuros.get(id) ?? 0 };
  },

  async getDisponibilidade(id: string, businessId: string) {
    const lista = await professionalService.getProfessionals(businessId);
    const p = lista.find((x) => x.id === id);
    if (!p) throw new NotFoundError('Profissional');
    return { id, available: p.available, agendamentosFuturos: p.agendamentosFuturos };
  },

  async deleteProfessional(id: string, businessId: string): Promise<void> {
    const result = await (professionalRepository as unknown as {
      softDelete(id: string, businessId: string): Promise<unknown>;
    }).softDelete(id, businessId);
    if (!result) throw new NotFoundError('Profissional');
  },
};
