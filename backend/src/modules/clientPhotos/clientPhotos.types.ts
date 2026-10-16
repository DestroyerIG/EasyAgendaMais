import { z } from 'zod';

export const PHOTO_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const UuidParam = z.string().uuid();

export const UploadPhotoSchema = z.object({
  imageBase64: z.string().min(1),
  contentType: z.enum(PHOTO_CONTENT_TYPES),
  caption: z.string().trim().max(255).optional(),
  appointmentId: z.string().uuid().optional(),
  takenAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type UploadPhotoInput = z.infer<typeof UploadPhotoSchema>;

export interface ClientPhotoDto {
  id: string;
  url: string | null;
  caption: string | null;
  serviceName: string | null;
  takenAt: string;
}
