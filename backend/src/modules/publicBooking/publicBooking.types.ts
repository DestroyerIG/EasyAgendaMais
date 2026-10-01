import { z } from 'zod';

export const GetPublicAvailabilitySchema = z.object({
  serviceId: z.string().uuid(),
  professionalId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const CreatePublicAppointmentSchema = z.object({
  serviceId: z.string().uuid(),
  professionalId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  clientName: z.string().trim().min(2).max(255),
  clientPhone: z.string().trim().min(10).max(20),
});

export type GetPublicAvailabilityQuery = z.infer<typeof GetPublicAvailabilitySchema>;
export type CreatePublicAppointmentInput = z.infer<typeof CreatePublicAppointmentSchema>;

export interface StorefrontService {
  id: string;
  name: string;
  price: number;
  durationMinutes: number;
  depositPercentage: number;
  depositAmount: number;
}

export interface Storefront {
  businessId: string;
  name: string;
  logoUrl: string | null;
  brandColor: string | null;
  galleryPhotos: string[];
  services: StorefrontService[];
}
