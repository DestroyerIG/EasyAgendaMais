import api from '@/lib/api';

import type { Vocabulario } from '@/lib/vocabulario';

export interface StorefrontServiceDto {
  id: string;
  name: string;
  price: number;
  durationMinutes: number;
  depositPercentage: number;
  depositAmount: number;
  descricao?: string | null;
}

export interface StorefrontDto {
  businessId: string;
  name: string;
  logoUrl: string | null;
  brandColor: string | null;
  galleryPhotos: string[];
  address: string | null;
  coverUrl?: string | null;
  descricao?: string | null;
  comodidades?: string[];
  /** Só vem com o dono ligando e 5 ou mais avaliações. */
  nota?: { media: number; quantidade: number } | null;
  /** "19:00"; null se não abre hoje ou já fechou. */
  atendeHojeAte?: string | null;
  services: StorefrontServiceDto[];
  /** Termos do segmento do negócio (fase 6). */
  vocabulario?: Vocabulario;
  /** Contingência: o link público não aceita novos agendamentos. */
  agendaPausada?: boolean;
  /** Só dígitos, como cadastrado; pode já trazer o 55. */
  whatsapp?: string | null;
  /** Formas de sinal liberadas pelo negócio; sem o campo, só Pix. */
  formasPagamento?: FormaSinal[];
}

export interface ProfessionalDto {
  id: string;
  name: string;
}

export interface HorarioDto { horario: string; livre: boolean }
export interface VagasDoDiaDto { date: string; vagas: number }
export type FormaSinal = 'pix' | 'cartao';
export type SituacaoReserva = 'aguardando' | 'confirmado' | 'expirado' | 'cancelado';

export interface CreatePublicAppointmentPayload {
  serviceId: string;
  professionalId: string;
  date: string;
  time: string;
  clientName: string;
  clientPhone: string;
  /** Caixa de consentimento de WhatsApp (começa desmarcada); true grava o consentimento com canal "publico". */
  whatsappConsent: boolean;
  formaPagamento?: FormaSinal;
}

export interface CreatePublicAppointmentResponse {
  appointmentId: string;
  depositAmount: number;
  pixPayload: string | null;
  checkoutUrl?: string | null;
  forma?: FormaSinal;
  automatica?: boolean;
  cartaoIndisponivel?: boolean;
  expiresAt: string;
}

/** O que a página precisa para remontar a reserva; sem dado pessoal da cliente. */
export interface ReservaPublicaDto {
  servico: { name: string; price: number; durationMinutes: number };
  profissional: string | null;
  data: string;
  horario: string;
  sinal: number;
  forma: FormaSinal;
  pixPayload: string | null;
  checkoutUrl: string | null;
  expiresAt: string | null;
}

export interface StatusReservaDto {
  situacao: SituacaoReserva;
  reserva: ReservaPublicaDto;
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

  async getAvailabilityGrid(slug: string, params: { serviceId: string; professionalId: string; date: string }): Promise<HorarioDto[]> {
    const response = await api.get(`/public/${slug}/availability/grade`, { params });
    return response.data;
  },

  async getAvailabilityDays(slug: string, params: { serviceId: string; professionalId: string }): Promise<VagasDoDiaDto[]> {
    const response = await api.get(`/public/${slug}/availability/dias`, { params });
    return response.data;
  },

  async getAppointmentStatus(slug: string, appointmentId: string): Promise<StatusReservaDto> {
    const response = await api.get(`/public/${slug}/appointments/${appointmentId}/status`);
    return response.data;
  },

  async createAppointment(slug: string, payload: CreatePublicAppointmentPayload): Promise<CreatePublicAppointmentResponse> {
    const response = await api.post(`/public/${slug}/appointments`, payload);
    return response.data;
  },

  async trocarParaPix(slug: string, appointmentId: string): Promise<{ pixPayload: string; forma: 'pix'; expiresAt: string }> {
    const response = await api.post(`/public/${slug}/appointments/${appointmentId}/pix`);
    return response.data;
  },
};
