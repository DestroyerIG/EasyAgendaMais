import api from '@/lib/api';

import type { Vocabulario } from '@/lib/vocabulario';

export interface StorefrontServiceDto {
  id: string;
  name: string;
  price: number;
  durationMinutes: number;
  depositPercentage: number;
  depositAmount: number;
}

export interface StorefrontDto {
  businessId: string;
  name: string;
  logoUrl: string | null;
  brandColor: string | null;
  galleryPhotos: string[];
  address: string | null;
  services: StorefrontServiceDto[];
  /** Termos do segmento do negócio (fase 6). */
  vocabulario?: Vocabulario;
}

export interface ProfessionalDto {
  id: string;
  name: string;
}

export interface CreatePublicAppointmentPayload {
  serviceId: string;
  professionalId: string;
  date: string;
  time: string;
  clientName: string;
  clientPhone: string;
  /** Caixa de consentimento de WhatsApp (começa desmarcada); true grava o consentimento com canal "publico". */
  whatsappConsent: boolean;
}

export interface CreatePublicAppointmentResponse {
  appointmentId: string;
  depositAmount: number;
  pixPayload: string;
  expiresAt: string;
}

export const publicBookingApi = {
  async getStorefront(slug: string): Promise<StorefrontDto> {
    const response = await api.get(`/public/${slug}`);
    return response.data;
  },

  async getProfessionals(slug: string): Promise<ProfessionalDto[]> {
    const response = await api.get(`/public/${slug}/professionals`);
    return response.data;
  },

  async getAvailability(slug: string, params: { serviceId: string; professionalId: string; date: string }): Promise<string[]> {
    const response = await api.get(`/public/${slug}/availability`, { params });
    return response.data;
  },

  async createAppointment(slug: string, payload: CreatePublicAppointmentPayload): Promise<CreatePublicAppointmentResponse> {
    const response = await api.post(`/public/${slug}/appointments`, payload);
    return response.data;
  },
};
