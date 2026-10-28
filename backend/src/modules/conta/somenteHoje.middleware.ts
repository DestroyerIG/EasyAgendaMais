import type { RequestHandler } from 'express';
import { prisma } from '../../config/prisma.js';
import { getBusinessScheduleSettings } from '../../services/scheduleSettingsService.js';
import { NotFoundError, SubscriptionRequiredError } from '../../utils/errors.js';

// Mesma convenção do cronService: YYYY-MM-DD no fuso do negócio.
const dateInTz = (d: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  return `${get('year') ?? '1970'}-${get('month') ?? '01'}-${get('day') ?? '01'}`;
};

/**
 * Na carência só se mexe em atendimento de hoje (fuso do negócio) que já existia
 * antes de a carência começar. Fora da carência não faz nada.
 */
export const somenteHojeNaCarencia: RequestHandler = async (req, _res, next) => {
  try {
    const estado = req.estadoConta;
    if (estado?.tipo !== 'carencia') return next();

    const businessId = req.user!.businessId;
    const agendamento = await prisma.appointment.findFirst({
      where: { id: req.params.id, businessId },
      select: { date: true, createdAt: true },
    });
    if (!agendamento) return next(new NotFoundError('Agendamento'));

    const { timezone } = await getBusinessScheduleSettings(businessId);
    const ehHoje = agendamento.date.toISOString().slice(0, 10) === dateInTz(new Date(), timezone);
    const jaExistia = agendamento.createdAt.getTime() < estado.desde.getTime();
    if (ehHoje && jaExistia) return next();

    return next(new SubscriptionRequiredError({
      estado: 'carencia',
      message: 'Disponível depois de regularizar a assinatura.',
    }));
  } catch (err) {
    return next(err);
  }
};
