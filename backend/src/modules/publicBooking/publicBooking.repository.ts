import { prisma } from '../../config/prisma.js';
import { clientRepository } from '../../repositories/clientRepository.js';

export const publicBookingRepository = {
  async findBusinessBySlug(slug: string) {
    return prisma.business.findFirst({
      where: { slug, active: true },
      select: {
        id: true, name: true, logoUrl: true, brandColor: true, pixKey: true, pixKeyType: true,
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
    const existing = await clientRepository.findByPhone(businessId, phone);
    if (existing) return existing;
    return clientRepository.create({
      businessId, name, phone,
      email: null, birthDate: null, address: null, notes: null,
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
  }) {
    return prisma.appointment.create({
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
