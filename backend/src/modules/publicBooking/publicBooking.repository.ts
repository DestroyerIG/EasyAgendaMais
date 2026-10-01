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
        id: true, name: true, logoUrl: true, brandColor: true, galleryPhotos: true, pixKey: true, pixKeyType: true,
      },
    });
  },

  async findEligibleServices(businessId: string) {
    // `gt: 0` (em vez de `not: null`) exclui tanto "sem sinal configurado" (null)
    // quanto "sinal configurado como 0%" — ambos não devem aparecer na vitrine
    // pública, pois um depósito de R$0 faz buildPixPayload lançar (amount <= 0).
    return prisma.service.findMany({
      where: { businessId, active: true, depositPercentage: { gt: 0 } },
      select: { id: true, name: true, price: true, durationMinutes: true, depositPercentage: true },
    });
  },

  async findProfessionalsForService(businessId: string) {
    return prisma.professional.findMany({
      where: { businessId, active: true },
      select: { id: true, name: true },
    });
  },

  async findServiceForBusiness(businessId: string, serviceId: string) {
    return prisma.service.findFirst({
      where: { id: serviceId, businessId, active: true, depositPercentage: { gt: 0 } },
      select: { id: true, name: true, price: true, durationMinutes: true, depositPercentage: true },
    });
  },

  async findProfessionalForBusiness(businessId: string, professionalId: string) {
    return prisma.professional.findFirst({
      where: { id: professionalId, businessId, active: true },
      select: { id: true },
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
    expiresAt: Date;
  }, db: Tx = prisma) {
    return db.appointment.create({
      data: {
        businessId: data.businessId,
        clientId: data.clientId,
        professionalId: data.professionalId,
        serviceId: data.serviceId,
        date: new Date(data.date),
        time: new Date(`1970-01-01T${data.time}:00Z`),
        status: 'aguardando_pagamento',
        expiresAt: data.expiresAt,
        source: 'publico',
      },
      include: {
        client: { select: { name: true, phone: true } },
        service: { select: { name: true, price: true } },
      },
    });
  },
};
