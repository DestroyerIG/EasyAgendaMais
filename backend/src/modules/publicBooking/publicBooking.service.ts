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
import { conexaoService } from '../recebimentos/conexao.service.js';
import { cobrancasService } from '../recebimentos/cobrancas.service.js';
import { recebimentosRepository } from '../recebimentos/recebimentos.repository.js';
import type { FormaSinal } from '../recebimentos/recebimentos.types.js';

type PixKeyType = Parameters<typeof buildPixPayload>[0]['pixKeyType'];

/** Código Pix manual (chave do negócio). Nulo se o negócio não tem chave ou o valor não vale. */
const pixManual = (
  business: { name: string; pixKey: string | null; pixKeyType: string | null },
  valor: number,
  servico: string,
): string | null => {
  if (!business.pixKey || !business.pixKeyType || valor <= 0) return null;
  try {
    return buildPixPayload({
      pixKey: business.pixKey, pixKeyType: business.pixKeyType as PixKeyType,
      merchantName: business.name, merchantCity: 'BRASIL', amount: valor, description: `Sinal - ${servico}`,
    });
  } catch (err) {
    logger.warn({ err }, 'Falha ao montar o código Pix manual');
    return null;
  }
};

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
    const formasPagamento = await conexaoService.formas(business.id).catch((): FormaSinal[] => ['pix']);
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
      formasPagamento,
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

  /** Situação da reserva e o que a página precisa para pagar. Não devolve dado da cliente. */
  async getAppointmentStatus(slug: string, id: string) {
    const business = await publicBookingRepository.findBusinessBySlug(slug);
    if (!business) throw new NotFoundError('Página');
    const reserva = await publicBookingRepository.findPublicAppointment(business.id, id);
    if (!reserva) throw new NotFoundError('Reserva');

    const situacao = situacaoDaReserva(reserva.status, reserva.expiresAt, new Date());
    const sinal = Number(reserva.depositAmount ?? 0);
    const cobrancas = await recebimentosRepository.cobrancasDaReserva(reserva.id);

    let forma: FormaSinal = 'pix';
    let pixPayload: string | null = null;
    let checkoutUrl: string | null = null;
    if (situacao === 'aguardando') {
      // Sem id externo a cobrança ainda não existe no gateway (ou ficou órfã): não há o que pagar nela.
      const atual = cobrancas.find((c) => c.idExterno !== null && (c.situacao === 'pendente' || c.situacao === 'recusada'));
      forma = atual?.forma === 'cartao' ? 'cartao' : 'pix';
      checkoutUrl = atual?.checkoutUrl ?? null;
      if (forma === 'pix') pixPayload = atual?.codigoPix ?? pixManual(business, sinal, reserva.service.name);
    } else {
      // A paga original tem id externo; as linhas de pagamento repetido não.
      const paga = cobrancas.find((c) => c.situacao === 'paga' && c.idExterno !== null);
      if (paga?.forma === 'cartao') forma = 'cartao';
    }

    return {
      situacao,
      reserva: {
        servico: { name: reserva.service.name, price: Number(reserva.service.price), durationMinutes: reserva.service.durationMinutes },
        profissional: reserva.professional?.name ?? null,
        data: reserva.date.toISOString().slice(0, 10),
        horario: reserva.time.toISOString().slice(11, 16),
        sinal,
        forma, pixPayload, checkoutUrl,
        expiresAt: reserva.expiresAt?.toISOString() ?? null,
      },
    };
  },

  /**
   * Código Pix da reserva. Repete o da cobrança Pix pendente; sem ela, tenta criar uma no gateway
   * e, se não der, devolve o código manual (sem cobrança).
   */
  async getPixDaReserva(slug: string, id: string) {
    const business = await publicBookingRepository.findBusinessBySlug(slug);
    if (!business) throw new NotFoundError('Página');
    const reserva = await publicBookingRepository.findPublicAppointment(business.id, id);
    if (!reserva) throw new NotFoundError('Reserva');
    if (situacaoDaReserva(reserva.status, reserva.expiresAt, new Date()) !== 'aguardando' || !reserva.expiresAt) {
      throw new ConflictError('Esta reserva não está mais aguardando o pagamento do sinal');
    }
    const expiresAt = reserva.expiresAt.toISOString();

    const cobrancas = await recebimentosRepository.cobrancasDaReserva(reserva.id);
    const existente = cobrancas.find((c) => c.forma === 'pix' && c.situacao === 'pendente' && c.codigoPix);
    if (existente?.codigoPix) return { pixPayload: existente.codigoPix, forma: 'pix' as const, expiresAt };

    const sinal = Number(reserva.depositAmount ?? 0);
    if ((await conexaoService.formas(business.id)).includes('pix')) {
      const criada = await cobrancasService.criar({
        businessId: business.id, slug, appointmentId: reserva.id, forma: 'pix', valor: sinal,
        descricao: `Sinal - ${reserva.service.name}`, venceEm: reserva.expiresAt,
      });
      if (criada?.pixPayload) return { pixPayload: criada.pixPayload, forma: 'pix' as const, expiresAt };
    }

    const manual = pixManual(business, sinal, reserva.service.name);
    if (!manual) throw new ValidationError('Este negócio ainda não configurou o recebimento de sinal via Pix');
    return { pixPayload: manual, forma: 'pix' as const, expiresAt };
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

    const formas = await conexaoService.formas(business.id);
    const formaPedida: FormaSinal = data.formaPagamento ?? 'pix';
    if (formaPedida === 'cartao' && !formas.includes('cartao')) {
      throw new ValidationError('Este negócio não recebe o sinal no cartão');
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

    const pixManualPayload = buildPixPayload({
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

    // Cobrança automática fora da transação (não segura a trava durante a chamada ao gateway).
    // Qualquer falha cai no Pix manual; o cartão que falha vira Pix manual e avisa a página.
    const usaGateway = formaPedida === 'cartao' || formas.includes('pix');
    const cobranca = usaGateway
      ? await cobrancasService.criar({
        businessId: business.id, slug, appointmentId: appointment.id, forma: formaPedida, valor: depositAmount,
        descricao: `Sinal - ${service.name}`, venceEm: expiresAt,
      })
      : null;
    const forma: FormaSinal = cobranca ? formaPedida : 'pix';
    const cartaoIndisponivel = formaPedida === 'cartao' && !cobranca;
    const pixPayload = forma === 'pix' ? (cobranca?.pixPayload ?? pixManualPayload) : null;
    const checkoutUrl = cobranca?.checkoutUrl ?? null;

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

    // Só o Pix manda o código; no cartão a cliente paga no Checkout.
    if (pixPayload) {
      void automacoesGatilhos.aoCriarReservaComSinal(business.id, appointment.id, {
        phone: data.clientPhone, nome: data.clientName, servico: service.name, valorSinal: depositAmount, pixPayload,
        data: `${day}/${month}`, horario: data.time, toleranciaMin,
      }).catch((err) => logger.warn({ err, appointmentId: appointment.id }, 'Envio do sinal Pix pelo WhatsApp falhou'));
    }

    return {
      appointmentId: appointment.id,
      depositAmount,
      pixPayload,
      checkoutUrl,
      forma,
      automatica: cobranca !== null,
      cartaoIndisponivel,
      expiresAt: expiresAt.toISOString(),
    };
  },
};
