import { NotFoundError, ValidationError, ConflictError } from '../../utils/errors.js';
import { publicBookingRepository } from './publicBooking.repository.js';
import { appointmentsPrismaRepository } from '../appointments/appointments.repository.js';
import { closesTodayAt, generateAvailableTimeSlots, getBusinessScheduleSettings } from '../../services/scheduleSettingsService.js';
import { buildPixPayload } from '../../utils/pixPayload.js';
import { notificationsService } from '../notifications/notifications.service.js';
import logger from '../../utils/logger.js';
import { vocabularioDe } from '../../config/vocabulario.js';
import { automacoesGatilhos } from '../whatsappAutomacoes/gatilhos.service.js';
import type { CreatePublicAppointmentInput, GetPublicAvailabilityQuery, GetPublicDaysQuery, Storefront } from './publicBooking.types.js';
import { DIAS_NA_FAIXA, diasAPartirDe, notaPublica, situacaoDaReserva } from './publicBooking.rules.js';
import { estadoContaService } from '../conta/estadoConta.service.js';
import { textoAgendaPausada } from '../conta/estadoConta.rules.js';
import { googleAgendaService } from '../googleAgenda/googleAgenda.service.js';


const calcDeposit = (price: number, depositPercentage: number): number =>
  Math.round(price * (depositPercentage / 100) * 100) / 100;

const todayInTimezone = (timeZone: string): string => {
  // en-CA formata como YYYY-MM-DD, comparável lexicograficamente com `date`.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
};

/**
 * Carrega as configurações de agenda do negócio, rejeita datas anteriores a hoje
 * (no fuso do negócio) e calcula os horários livres do profissional naquele dia.
 */
const computeAvailableSlots = async (
  businessId: string,
  professionalId: string,
  date: string,
  serviceDurationMinutes: number
): Promise<string[]> => {
  const businessSettings = await getBusinessScheduleSettings(businessId);
  return slotsLivres(businessSettings, businessId, professionalId, date, serviceDurationMinutes);
};

type ScheduleSettings = Awaited<ReturnType<typeof getBusinessScheduleSettings>>;

const slotsLivres = async (
  businessSettings: ScheduleSettings,
  businessId: string,
  professionalId: string,
  date: string,
  serviceDurationMinutes: number
): Promise<string[]> => {
  const timeZone = businessSettings?.timezone || 'America/Sao_Paulo';
  if (date < todayInTimezone(timeZone)) {
    throw new ValidationError('Não é possível agendar em uma data que já passou');
  }

  const bookedTimes = await appointmentsPrismaRepository.getBookedSlots(businessId, professionalId, date);

  const pausa = await appointmentsPrismaRepository.getProfessionalBreak(professionalId, businessId);
  const doGoogle = await googleAgendaService.bloqueiosDoDia(businessId, professionalId, date);

  return generateAvailableTimeSlots(businessSettings, date, {
    serviceDurationMinutes,
    bookedTimes,
    blockedRanges: [...(pausa ? [pausa] : []), ...doGoogle],
  });
};

const consultaDeAgenda = async (slug: string, query: GetPublicDaysQuery) => {
  const business = await publicBookingRepository.findBusinessBySlug(slug);
  if (!business) throw new NotFoundError('Página');

  const service = await publicBookingRepository.findServiceForBusiness(business.id, query.serviceId);
  if (!service) throw new ValidationError('Serviço indisponível para este negócio');

  const professional = await publicBookingRepository.findProfessionalForBusiness(business.id, query.professionalId);
  if (!professional) throw new ValidationError('Profissional indisponível para este negócio');

  return { business, service };
};

export const publicBookingService = {
  async getStorefront(slug: string): Promise<Storefront> {
    const business = await publicBookingRepository.findBusinessBySlug(slug);
    if (!business) throw new NotFoundError('Página');

    const services = await publicBookingRepository.findEligibleServices(business.id);
    const estado = await estadoContaService.doNegocio(business.id);
    const agenda = await getBusinessScheduleSettings(business.id);
    const notas = business.mostrarNota ? await publicBookingRepository.resumoDasNotas(business.id) : null;

    return {
      businessId: business.id,
      name: business.name,
      logoUrl: business.logoUrl,
      brandColor: business.brandColor,
      galleryPhotos: business.galleryPhotos,
      address: business.address,
      coverUrl: business.coverUrl,
      descricao: business.description,
      comodidades: business.comodidades,
      nota: notaPublica(business.mostrarNota, notas),
      atendeHojeAte: closesTodayAt(agenda),
      whatsapp: business.whatsapp ?? null,
      agendaPausada: estado.tipo !== 'ativa',
      services: services.map((s) => ({
        id: s.id,
        name: s.name,
        price: Number(s.price),
        durationMinutes: s.durationMinutes,
        depositPercentage: Number(s.depositPercentage),
        depositAmount: calcDeposit(Number(s.price), Number(s.depositPercentage)),
        descricao: s.description,
      })),
      vocabulario: vocabularioDe(business.settings?.segment),
    };
  },

  async getProfessionals(slug: string) {
    const business = await publicBookingRepository.findBusinessBySlug(slug);
    if (!business) throw new NotFoundError('Página');
    return publicBookingRepository.findProfessionalsForService(business.id);
  },

  async getAvailability(slug: string, query: GetPublicAvailabilityQuery) {
    const { business, service } = await consultaDeAgenda(slug, query);
    return computeAvailableSlots(business.id, query.professionalId, query.date, service.durationMinutes);
  },

  /** Horários do dia com a situação de cada um: os ocupados aparecem riscados na página. */
  async getAvailabilityGrid(slug: string, query: GetPublicAvailabilityQuery) {
    const { business, service } = await consultaDeAgenda(slug, query);
    const agenda = await getBusinessScheduleSettings(business.id);
    const livres = new Set(await slotsLivres(agenda, business.id, query.professionalId, query.date, service.durationMinutes));
    const todos = generateAvailableTimeSlots(agenda, query.date, { serviceDurationMinutes: service.durationMinutes });
    return todos.map((horario) => ({ horario, livre: livres.has(horario) }));
  },

  /** Vagas de cada um dos próximos dias, para a faixa de escolha do dia. */
  async getAvailabilityDays(slug: string, query: GetPublicDaysQuery) {
    const { business, service } = await consultaDeAgenda(slug, query);
    const agenda = await getBusinessScheduleSettings(business.id);
    const hoje = todayInTimezone(agenda?.timezone || 'America/Sao_Paulo');
    return Promise.all(diasAPartirDe(hoje, DIAS_NA_FAIXA).map(async (date) => ({
      date,
      vagas: (await slotsLivres(agenda, business.id, query.professionalId, date, service.durationMinutes)).length,
    })));
  },

  /** Situação da reserva para a página acompanhar a confirmação. Não devolve dado da cliente. */
  async getAppointmentStatus(slug: string, id: string) {
    const business = await publicBookingRepository.findBusinessBySlug(slug);
    if (!business) throw new NotFoundError('Página');
    const reserva = await publicBookingRepository.findPublicAppointment(business.id, id);
    if (!reserva) throw new NotFoundError('Reserva');
    return { situacao: situacaoDaReserva(reserva.status, reserva.expiresAt, new Date()) };
  },

  async createPendingAppointment(slug: string, data: CreatePublicAppointmentInput) {
    const business = await publicBookingRepository.findBusinessBySlug(slug);
    if (!business) throw new NotFoundError('Página');
    if ((await estadoContaService.doNegocio(business.id)).tipo !== 'ativa') {
      throw new ConflictError(textoAgendaPausada(business.name));
    }
    if (!business.pixKey || !business.pixKeyType) {
      throw new ValidationError('Este negócio ainda não configurou o recebimento de sinal via Pix');
    }

    const service = await publicBookingRepository.findServiceForBusiness(business.id, data.serviceId);
    if (!service) throw new ValidationError('Serviço indisponível para este negócio');

    const professional = await publicBookingRepository.findProfessionalForBusiness(business.id, data.professionalId);
    if (!professional) throw new ValidationError('Profissional indisponível para este negócio');

    const availableSlots = await computeAvailableSlots(
      business.id, data.professionalId, data.date, service.durationMinutes
    );
    if (!availableSlots.includes(data.time)) {
      throw new ValidationError('Horário indisponível para este serviço e profissional');
    }

    const client = await publicBookingRepository.findOrCreateClient(business.id, data.clientName, data.clientPhone);

    // Calcula o depósito e monta o payload Pix ANTES de criar a reserva: buildPixPayload
    // pode lançar (ex.: amount <= 0), e não queremos uma reserva "fantasma" em
    // aguardando_pagamento (segurando o horário por 15min) se o payload falhar.
    const depositAmount = calcDeposit(Number(service.price), Number(service.depositPercentage));

    const pixPayload = buildPixPayload({
      pixKey: business.pixKey,
      pixKeyType: business.pixKeyType as never,
      merchantName: business.name,
      merchantCity: 'BRASIL',
      amount: depositAmount,
      description: `Sinal - ${service.name}`,
    });

    const toleranciaMin = await automacoesGatilhos.toleranciaSinal(business.id);
    const expiresAt = new Date(Date.now() + toleranciaMin * 60 * 1000);

    // Checagem de conflito + criação dentro de uma única transação com advisory lock
    // por profissional+dia: duas requisições simultâneas para o mesmo horário são
    // serializadas, e a segunda enxerga a reserva da primeira e recebe 409.
    const appointment = await publicBookingRepository.withProfessionalDayLock(
      data.professionalId, data.date, async (tx) => {
        const conflict = await appointmentsPrismaRepository.hasConflict(
          business.id, data.professionalId, data.date, `${data.time}:00`, undefined, tx
        );
        if (conflict) throw new ConflictError('Este horário acabou de ser reservado por outra pessoa');

        return publicBookingRepository.createPendingAppointment({
          businessId: business.id,
          clientId: client.id,
          professionalId: data.professionalId,
          serviceId: data.serviceId,
          date: data.date,
          time: data.time,
          expiresAt,
          depositAmount,
        }, tx);
      }
    );

    logger.info({ appointmentId: appointment.id, businessId: business.id }, 'Reserva pública criada, aguardando pagamento');
    void googleAgendaService.sincronizarSaida({ appointmentId: appointment.id });

    // Fora da transação da reserva: se gravar o consentimento falhar, a reserva continua valendo.
    if (data.whatsappConsent === true) {
      try {
        await publicBookingRepository.registrarConsentimento({ businessId: business.id, clientId: client.id });
      } catch (err) {
        logger.error({ err, businessId: business.id, clientId: client.id }, 'Falha ao gravar consentimento da reserva pública');
      }
    }

    const [year, month, day] = data.date.split('-');
    await notificationsService.notify(business.id, {
      type: 'nova_reserva',
      title: 'Nova reserva online',
      description: `${data.clientName} · ${service.name} · ${day}/${month}/${year} às ${data.time}`,
    });

    void automacoesGatilhos.aoCriarReservaComSinal(business.id, appointment.id, {
      phone: data.clientPhone, nome: data.clientName, servico: service.name, valorSinal: depositAmount, pixPayload,
      data: `${day}/${month}`, horario: data.time, toleranciaMin,
    }).catch((err) => logger.warn({ err, appointmentId: appointment.id }, 'Envio do sinal Pix pelo WhatsApp falhou'));

    return {
      appointmentId: appointment.id,
      depositAmount,
      pixPayload,
      expiresAt: expiresAt.toISOString(),
    };
  },
};
