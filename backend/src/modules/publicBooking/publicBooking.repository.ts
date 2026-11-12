import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import { clientRepository } from '../../repositories/clientRepository.js';
import { normalizePhone } from '../../utils/whatsapp.js';

type Tx = Prisma.TransactionClient;

export const publicBookingRepository = {
  async findBusinessBySlug(slug: string) {
    return prisma.business.findFirst({
      where: { slug, active: true },
      select: {
        id: true, name: true, logoUrl: true, brandColor: true, galleryPhotos: true, address: true, whatsapp: true, pixKey: true, pixKeyType: true,
        coverUrl: true, description: true, comodidades: true, mostrarNota: true, botCobraSinal: true, sinalPadraoPct: true,
        settings: { select: { segment: true } },
      },
    });
  },

  async findEligibleServices(businessId: string) {
    // Serviço sem sinal (null ou 0%) também aparece: a reserva dele é confirmada direto, sem Pix.
    return prisma.service.findMany({
      where: { businessId, active: true },
      select: { id: true, name: true, price: true, durationMinutes: true, depositPercentage: true, description: true },
    });
  },

  async findProfessionalsForService(businessId: string) {
    return prisma.professional.findMany({
      where: { businessId, active: true, available: true },
      select: { id: true, name: true },
    });
  },

  async findServiceForBusiness(businessId: string, serviceId: string) {
    return prisma.service.findFirst({
      where: { id: serviceId, businessId, active: true },
      select: { id: true, name: true, price: true, durationMinutes: true, depositPercentage: true },
    });
  },

  async findProfessionalForBusiness(businessId: string, professionalId: string) {
    return prisma.professional.findFirst({
      where: { id: professionalId, businessId, active: true, available: true },
      select: { id: true },
    });
  },

  /** Média e quantidade de todas as avaliações do negócio (link e WhatsApp). */
  async resumoDasNotas(businessId: string) {
    const r = await prisma.whatsappRating.aggregate({ where: { businessId }, _avg: { rating: true }, _count: { _all: true } });
    return { media: r._avg.rating, quantidade: r._count._all };
  },

  async findPublicAppointment(businessId: string, id: string) {
    return prisma.appointment.findFirst({
      where: { id, businessId, source: 'publico' },
      select: {
        id: true, status: true, expiresAt: true, date: true, time: true, depositAmount: true,
        service: { select: { name: true, price: true, durationMinutes: true } },
        professional: { select: { name: true } },
      },
    });
  },

  async findOrCreateClient(businessId: string, name: string, phone: string): Promise<{ id: string }> {
    // Normaliza com a mesma regra do bot de WhatsApp (só dígitos, com DDI 55), para que
    // "(83) 99999-0000", "83999990000" e "+55 83 99999-0000" sejam o mesmo cliente.
    const normalizedPhone: string = normalizePhone(phone) ?? phone.replace(/\D/g, '');
    const existing = await clientRepository.findByPhone(businessId, normalizedPhone);
    if (existing) return existing;
    return clientRepository.create({
      businessId, name, phone: normalizedPhone,
      email: null, birthDate: null, address: null, notes: null,
    });
  },

  /**
   * Executa `fn` dentro de uma transação que segura um advisory lock do Postgres
   * para o par profissional+data. Duas reservas concorrentes para o mesmo
   * profissional no mesmo dia são serializadas: a segunda só faz sua checagem de
   * conflito depois que a primeira comitou (ou abortou). Um índice único não
   * resolveria, porque um horário "livre" depende de `expiresAt` (é condicional ao
   * tempo). O lock é liberado automaticamente no fim da transação.
   */
  async withProfessionalDayLock<T>(professionalId: string, date: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    const lockKey = `${professionalId}|${date}`;
    return prisma.$transaction(async (tx) => {
      // $executeRaw (e não $queryRaw): pg_advisory_xact_lock retorna `void`, que o
      // Prisma não consegue desserializar como coluna de resultado.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}::text))`;
      return fn(tx);
    });
  },

  async createPendingAppointment(data: {
    businessId: string;
    clientId: string;
    professionalId: string;
    serviceId: string;
    date: string;
    time: string;
    expiresAt: Date | null;
    depositAmount: number;
    source?: 'publico' | 'whatsapp';
    /** Padrão `aguardando_pagamento`; sem sinal a reserva já nasce `confirmado`. */
    status?: 'aguardando_pagamento' | 'confirmado';
  }, db: Tx = prisma) {
    return db.appointment.create({
      data: {
        businessId: data.businessId,
        clientId: data.clientId,
        professionalId: data.professionalId,
        serviceId: data.serviceId,
        date: new Date(data.date),
        time: new Date(`1970-01-01T${data.time}:00Z`),
        status: data.status ?? 'aguardando_pagamento',
        expiresAt: data.expiresAt,
        source: data.source ?? 'publico',
        depositAmount: data.depositAmount,
      },
      include: {
        client: { select: { name: true, phone: true } },
        service: { select: { name: true, price: true } },
      },
    });
  },

  /** Consentimento de lembretes pelo WhatsApp dado na página pública de reserva. */
  async registrarConsentimento(data: { businessId: string; clientId: string }): Promise<void> {
    await prisma.clientConsent.create({
      data: { businessId: data.businessId, clientId: data.clientId, granted: true, channel: 'publico' },
    });
  },
};
