import { z } from 'zod';

export const PixKeyTypeSchema = z.enum(['cpf', 'cnpj', 'email', 'telefone', 'aleatoria']);

export const UpdatePublicPageSchema = z.object({
  slug: z.string().min(3).max(100).regex(/^[a-z0-9-]+$/).optional(),
  pixKey: z.string().min(1).max(255).optional(),
  pixKeyType: PixKeyTypeSchema.optional(),
  logoUrl: z.string().url().max(2048).optional(),
  brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

export type UpdatePublicPageInput = z.infer<typeof UpdatePublicPageSchema>;

export interface PublicPageSettings {
  slug: string | null;
  pixKey: string | null;
  pixKeyType: string | null;
  logoUrl: string | null;
  brandColor: string | null;
}
