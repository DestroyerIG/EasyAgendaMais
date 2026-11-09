import { z } from 'zod';
import type { FormaSinal, GatewayId } from '../recebimentos/recebimentos.types.js';

export const GetPublicAvailabilitySchema = z.object({
  serviceId: z.string().uuid(),
  professionalId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const GetPublicDaysSchema = GetPublicAvailabilitySchema.omit({ date: true });

export const PublicAppointmentParamsSchema = z.object({ slug: z.string(), id: z.string().uuid() });

export const CreatePublicAppointmentSchema = z.object({
  serviceId: z.string().uuid(),
  professionalId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  clientName: z.string().trim().min(2).max(255),
  clientPhone: z.string().trim().min(10).max(20),
  // Caixa desmarcada por padrão na página (LGPD): só `true` grava consentimento.
  whatsappConsent: z.boolean().optional(),
  formaPagamento: z.enum(['pix', 'cartao']).optional(),
});

export type GetPublicAvailabilityQuery = z.infer<typeof GetPublicAvailabilitySchema>;
export type GetPublicDaysQuery = z.infer<typeof GetPublicDaysSchema>;
export type CreatePublicAppointmentInput = z.infer<typeof CreatePublicAppointmentSchema>;

export interface StorefrontService {
  id: string;
  name: string;
  price: number;
  durationMinutes: number;
  depositPercentage: number;
  depositAmount: number;
  descricao: string | null;
}

import type { Vocabulario } from '../../config/vocabulario.js';

export interface Storefront {
  businessId: string;
  name: string;
  logoUrl: string | null;
  brandColor: string | null;
  galleryPhotos: string[];
  address: string | null;
  coverUrl: string | null;
  descricao: string | null;
  comodidades: string[];
  nota: { media: number; quantidade: number } | null;
  atendeHojeAte: string | null;
  whatsapp: string | null;
  agendaPausada: boolean;
  formasPagamento: FormaSinal[];
  /** Gateway da conexão ativa, para a página saber como mostrar o pagamento. */
  gatewayPagamento: GatewayId | null;
  services: StorefrontService[];
  vocabulario: Vocabulario;
}
